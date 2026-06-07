"""
NBA Stats — нагрузочные исследования (asyncpg + httpx).
Результаты: ./research_results/exp*.json и summary.json
"""
from __future__ import annotations

import asyncio
import json
import os
import statistics
import time
from pathlib import Path
from typing import Any

import asyncpg
import httpx

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://nba_admin:nba_secure_pass_2024@localhost:5432/nba_stats",
).replace("postgresql+asyncpg://", "postgresql://")

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8700")
API_KEY = os.getenv("SECRET_KEY", "nba-stats-secret-key-2024")
SEASON_ID = 5
WARMUP = 10
ITERATIONS_DEFAULT = int(os.getenv("ITERATIONS", "100"))
CONCURRENCY_LEVELS = [1, 10, 50, 100]
CONCURRENCY_ROUNDS = 10


def _resolve_results_dir() -> Path:
    backend_root = Path(__file__).resolve().parents[2]
    code_root = backend_root.parent
    if (code_root / "docker-compose.yml").is_file():
        return code_root / "research_results"
    custom = os.getenv("RESEARCH_RESULTS_DIR")
    if custom:
        return Path(custom)
    return backend_root / "research_results"


RESULTS_DIR = _resolve_results_dir()
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

# Запрос к витрине (предвычисленные агрегаты)
LEADERS_QUERY = """
    SELECT player_id, per, avg_pts
    FROM player_season_stats
    WHERE season_id = $1
    ORDER BY per DESC NULLS LAST
    LIMIT 20
"""

LEADERS_CUMULATIVE_QUERY = """
    SELECT player_id, season_id, per, avg_pts
    FROM player_season_stats
    WHERE season_id = ANY($1::int[])
    ORDER BY per DESC NULLS LAST
    LIMIT 20
"""

# Тяжёлый агрегирующий запрос напрямую по таблице фактов
HEAVY_AGG_QUERY = """
    SELECT
        gps.player_id,
        SUM(gps.points)         AS total_pts,
        COUNT(*)                AS games,
        AVG(gps.points::float)  AS avg_pts
    FROM game_player_stats gps
    JOIN games g ON g.game_id = gps.game_id
    WHERE g.season_id = $1
    GROUP BY gps.player_id
    ORDER BY total_pts DESC
    LIMIT 20
"""

HEAVY_AGG_CUMULATIVE_QUERY = """
    SELECT
        gps.player_id,
        SUM(gps.points)         AS total_pts,
        COUNT(*)                AS games,
        AVG(gps.points::float)  AS avg_pts
    FROM game_player_stats gps
    JOIN games g ON g.game_id = gps.game_id
    WHERE g.season_id = ANY($1::int[])
    GROUP BY gps.player_id
    ORDER BY total_pts DESC
    LIMIT 20
"""

LEADERS_URL = (
    f"{API_BASE_URL}/stats/leaders"
    f"?metric=per&season_id={SEASON_ID}&limit=20"
)


def p95_ms(times: list[float]) -> float:
    if not times:
        return 0.0
    s = sorted(times)
    idx = min(len(s) - 1, int(len(s) * 0.95))
    return round(s[idx], 2)


def timing_stats(times: list[float], errors: int = 0) -> dict[str, float]:
    n = len(times)
    err_pct = round(100.0 * errors / n, 2) if n else 0.0
    return {
        "median_ms": round(statistics.median(times), 2) if times else 0.0,
        "mean_ms": round(statistics.mean(times), 2) if times else 0.0,
        "p95_ms": p95_ms(times),
        "error_pct": err_pct,
    }


async def measure_sql(
    conn: asyncpg.Connection,
    season_ids: list[int],
    iterations: int = ITERATIONS_DEFAULT,
) -> list[float]:
    for _ in range(WARMUP):
        for sid in season_ids:
            await conn.fetch(LEADERS_QUERY, sid)

    samples: list[float] = []
    for _ in range(iterations):
        lap: list[float] = []
        for sid in season_ids:
            t0 = time.perf_counter()
            await conn.fetch(LEADERS_QUERY, sid)
            lap.append((time.perf_counter() - t0) * 1000)
        samples.append(statistics.mean(lap))
    return samples


async def row_count(conn: asyncpg.Connection, season_ids: list[int]) -> int:
    return await conn.fetchval(
        "SELECT COUNT(*) FROM player_season_stats WHERE season_id = ANY($1::int[])",
        season_ids,
    )


async def row_count_facts(conn: asyncpg.Connection, season_id: int) -> int:
    return await conn.fetchval(
        """
        SELECT COUNT(*)
        FROM game_player_stats gps
        JOIN games g ON g.game_id = gps.game_id
        WHERE g.season_id = $1
        """,
        season_id,
    )


async def explain_json(
    conn: asyncpg.Connection,
    season_id: int,
    query: str = LEADERS_QUERY,
) -> Any:
    plan = await conn.fetchval(
        f"EXPLAIN (FORMAT JSON) {query}",
        season_id,
    )
    if isinstance(plan, str):
        return json.loads(plan)
    return plan


async def measure_sql_single_season(
    conn: asyncpg.Connection,
    season_id: int,
    query: str = LEADERS_QUERY,
    iterations: int = ITERATIONS_DEFAULT,
) -> list[float]:
    for _ in range(WARMUP):
        await conn.fetch(query, season_id)

    times: list[float] = []
    for _ in range(iterations):
        t0 = time.perf_counter()
        await conn.fetch(query, season_id)
        times.append((time.perf_counter() - t0) * 1000)
    return times


# ---------------------------------------------------------------------------
# Исследование 1 — объём фактов: прямая агрегация vs витрина
# ---------------------------------------------------------------------------
async def measure_query_with_season_list(
    conn: asyncpg.Connection,
    season_ids: list[int],
    query: str,
    iterations: int = ITERATIONS_DEFAULT,
) -> list[float]:
    for _ in range(WARMUP):
        await conn.fetch(query, season_ids)

    times: list[float] = []
    for _ in range(iterations):
        t0 = time.perf_counter()
        await conn.fetch(query, season_ids)
        times.append((time.perf_counter() - t0) * 1000)
    return times


async def row_count_facts_many(conn: asyncpg.Connection, season_ids: list[int]) -> int:
    return await conn.fetchval(
        """
        SELECT COUNT(*)
        FROM game_player_stats gps
        JOIN games g ON g.game_id = gps.game_id
        WHERE g.season_id = ANY($1::int[])
        """,
        season_ids,
    )


async def experiment_1(conn: asyncpg.Connection) -> dict:
    print("\n=== Исследование 1: объём фактов, витрина vs агрегация ===")
    out: dict[str, Any] = {}

    scenarios = [(f"1-{last}", list(range(1, last + 1))) for last in range(1, 6)]

    for key, season_ids in scenarios:
        direct_times = await measure_query_with_season_list(
            conn, season_ids, HEAVY_AGG_CUMULATIVE_QUERY
        )
        vitrina_times = await measure_query_with_season_list(
            conn, season_ids, LEADERS_CUMULATIVE_QUERY
        )
        facts_count = await row_count_facts_many(conn, season_ids)
        vitrina_count = await row_count(conn, season_ids)

        out[key] = {
            "season_ids": season_ids,
            "facts_row_count": facts_count,
            "vitrina_row_count": vitrina_count,
            "direct_aggregation": {
                **timing_stats(direct_times),
                "iterations": len(direct_times),
            },
            "vitrina": {
                **timing_stats(vitrina_times),
                "iterations": len(vitrina_times),
            },
        }
        print(
            f"  {key}: facts={facts_count}, "
            f"agg={out[key]['direct_aggregation']['median_ms']} ms, "
            f"vitrina={out[key]['vitrina']['median_ms']} ms"
        )

    path = RESULTS_DIR / "exp1_volume.json"
    path.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    return out


# ---------------------------------------------------------------------------
# Исследование 2 — стратегии индексации на таблице фактов
# ---------------------------------------------------------------------------
async def experiment_2(conn: asyncpg.Connection) -> dict:
    print("\n=== Исследование 2: индексация на game_player_stats ===")
    configs = [
        (
            "no_index",
            """
            DROP INDEX IF EXISTS idx_games_season_id;
            DROP INDEX IF EXISTS idx_gps_player_id;
            DROP INDEX IF EXISTS idx_gps_team_game;
            SET enable_indexscan = off;
            SET enable_bitmapscan = off;
            """,
            """
            SET enable_indexscan = on;
            SET enable_bitmapscan = on;
            """,
        ),
        (
            "idx_games_season",
            """
            SET enable_indexscan = on;
            SET enable_bitmapscan = on;
            CREATE INDEX IF NOT EXISTS idx_games_season_id
                ON games(season_id);
            """,
            None,
        ),
        (
            "idx_gps_player",
            """
            CREATE INDEX IF NOT EXISTS idx_gps_player_id
                ON game_player_stats(player_id);
            """,
            None,
        ),
        (
            "idx_both",
            """
            CREATE INDEX IF NOT EXISTS idx_gps_team_game
                ON game_player_stats(team_id, game_id);
            """,
            None,
        ),
    ]

    facts_count = await row_count_facts(conn, SEASON_ID)
    out: dict[str, Any] = {
        "season_id": SEASON_ID,
        "facts_row_count": facts_count,
    }

    for key, setup_sql, teardown_sql in configs:
        await conn.execute(setup_sql)
        await conn.execute("ANALYZE game_player_stats")
        await conn.execute("ANALYZE games")

        times = await measure_sql_single_season(
            conn, SEASON_ID, query=HEAVY_AGG_QUERY
        )
        explain = await explain_json(conn, SEASON_ID, query=HEAVY_AGG_QUERY)
        out[key] = {
            **timing_stats(times),
            "iterations": len(times),
            "explain": explain,
        }
        print(f"  {key}: median={out[key]['median_ms']} ms")

        if teardown_sql:
            await conn.execute(teardown_sql)

    # Восстановить рабочие индексы.
    await conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_games_season_id ON games(season_id);
        CREATE INDEX IF NOT EXISTS idx_gps_player_id
            ON game_player_stats(player_id);
        CREATE INDEX IF NOT EXISTS idx_gps_team_game
            ON game_player_stats(team_id, game_id);
        CREATE INDEX IF NOT EXISTS idx_pss_season
            ON player_season_stats(season_id, per DESC NULLS LAST);
        ANALYZE game_player_stats;
        ANALYZE games;
        ANALYZE player_season_stats;
        """
    )

    path = RESULTS_DIR / "exp2_indexes.json"
    path.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    return out

# ---------------------------------------------------------------------------
# Исследование 3 — кэширование
# ---------------------------------------------------------------------------
async def clear_leaders_cache(client: httpx.AsyncClient) -> None:
    resp = await client.delete(
        f"{API_BASE_URL}/admin/cache/leaders",
        headers={"X-Api-Key": API_KEY},
        timeout=30.0,
    )
    if resp.status_code not in (200, 401):
        resp.raise_for_status()


async def experiment_4() -> dict:
    print("\n=== Исследование 3: кэширование ===")

    async with httpx.AsyncClient() as client:
        # Cache Miss — 30 итераций
        miss_times: list[float] = []
        miss_errors = 0
        for _ in range(WARMUP):
            await clear_leaders_cache(client)
            await client.get(LEADERS_URL, timeout=30.0)

        for _ in range(30):
            await clear_leaders_cache(client)
            t0 = time.perf_counter()
            try:
                resp = await client.get(LEADERS_URL, timeout=30.0)
                elapsed = (time.perf_counter() - t0) * 1000
                if resp.status_code >= 500:
                    miss_errors += 1
            except Exception:
                elapsed = (time.perf_counter() - t0) * 1000
                miss_errors += 1
            miss_times.append(elapsed)

        cache_miss = {**timing_stats(miss_times, miss_errors), "iterations": 30}

        # Cache Hit — прогрев + 100 итераций
        await client.get(LEADERS_URL, timeout=30.0)
        for _ in range(WARMUP):
            await client.get(LEADERS_URL, timeout=30.0)

        hit_times: list[float] = []
        hit_errors = 0
        for _ in range(ITERATIONS_DEFAULT):
            t0 = time.perf_counter()
            try:
                resp = await client.get(LEADERS_URL, timeout=30.0)
                elapsed = (time.perf_counter() - t0) * 1000
                if resp.status_code >= 500:
                    hit_errors += 1
            except Exception:
                elapsed = (time.perf_counter() - t0) * 1000
                hit_errors += 1
            hit_times.append(elapsed)

        cache_hit = {
            **timing_stats(hit_times, hit_errors),
            "iterations": ITERATIONS_DEFAULT,
        }

    out = {"cache_miss": cache_miss, "cache_hit": cache_hit}
    print(f"  miss: median={cache_miss['median_ms']} ms")
    print(f"  hit:  median={cache_hit['median_ms']} ms")

    path = RESULTS_DIR / "exp4_cache.json"
    path.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    return out


# ---------------------------------------------------------------------------
# Исследование 4 — параллельная нагрузка
# ---------------------------------------------------------------------------
async def experiment_5() -> dict:
    print("\n=== Исследование 4: параллельная нагрузка ===")
    timeout_s = 5.0
    out: dict[str, Any] = {
        "metadata": {
            "endpoint": LEADERS_URL,
            "levels": CONCURRENCY_LEVELS,
            "rounds": CONCURRENCY_ROUNDS,
            "warm_cache": "one warm-up GET before every round",
        }
    }

    async def one_request(client: httpx.AsyncClient) -> tuple[float, bool]:
        t0 = time.perf_counter()
        try:
            resp = await client.get(LEADERS_URL, timeout=timeout_s)
            elapsed = (time.perf_counter() - t0) * 1000
            ok = resp.status_code < 500 and elapsed <= timeout_s * 1000
            return elapsed, ok
        except Exception:
            return (time.perf_counter() - t0) * 1000, False

    async def run_scenario(client: httpx.AsyncClient) -> dict[str, Any]:
        scenario: dict[str, Any] = {}

        for n in CONCURRENCY_LEVELS:
            all_times: list[float] = []
            errors = 0

            for _ in range(CONCURRENCY_ROUNDS):
                await client.get(LEADERS_URL, timeout=30.0)
                tasks = [one_request(client) for _ in range(n)]
                results = await asyncio.gather(*tasks)
                for elapsed, ok in results:
                    all_times.append(elapsed)
                    if not ok:
                        errors += 1

            key = f"c{n}"
            stats = timing_stats(all_times, errors)
            scenario[key] = {
                **stats,
                "concurrency": n,
                "rounds": CONCURRENCY_ROUNDS,
                "total_requests": n * CONCURRENCY_ROUNDS,
            }
            print(
                f"  warm/N={n}: median={stats['median_ms']} ms, "
                f"errors={stats['error_pct']}%"
            )

        return scenario

    async with httpx.AsyncClient() as client:
        out["warm_cache"] = await run_scenario(client)

    path = RESULTS_DIR / "exp5_concurrency.json"
    path.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    return out


def build_summary(
    exp1: dict,
    exp2: dict,
    exp4: dict,
    exp5: dict,
) -> dict:
    def pick(d: dict) -> dict:
        return {
            k: d[k]
            for k in ("median_ms", "mean_ms", "p95_ms", "error_pct")
            if k in d
        }

    return {
        "exp1_volume_fact_vs_vitrina": {
            key: {
                "facts_row_count": value["facts_row_count"],
                "vitrina_row_count": value["vitrina_row_count"],
                "direct_aggregation": pick(value["direct_aggregation"]),
                "vitrina": pick(value["vitrina"]),
            }
            for key, value in exp1.items()
        },
        "exp2_fact_indexes": {
            "no_index": pick(exp2["no_index"]),
            "idx_games_season": pick(exp2["idx_games_season"]),
            "idx_gps_player": pick(exp2["idx_gps_player"]),
            "idx_both": pick(exp2["idx_both"]),
        },
        "exp3_cache": {
            "cache_miss": pick(exp4["cache_miss"]),
            "cache_hit": pick(exp4["cache_hit"]),
        },
        "exp4_concurrency": {
            key: pick(value)
            for key, value in exp5["warm_cache"].items()
        },
    }


async def main() -> None:
    print("NBA Stats — нагрузочные исследования")
    print(f"Результаты: {RESULTS_DIR}")

    conn = await asyncpg.connect(DATABASE_URL)
    try:
        exp1 = await experiment_1(conn)
        exp2 = await experiment_2(conn)
    finally:
        await conn.close()

    exp4 = await experiment_4()
    exp5 = await experiment_5()

    summary = build_summary(exp1, exp2, exp4, exp5)
    summary_path = RESULTS_DIR / "summary.json"
    summary_path.write_text(
        json.dumps(summary, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    print("\n=== summary.json ===")
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    print(f"\nГотово: {RESULTS_DIR}")


if __name__ == "__main__":
    asyncio.run(main())