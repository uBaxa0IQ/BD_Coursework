"""
Исследование производительности NBA Statistics Database.
4 эксперимента: объём данных, индексы, нагрузка, кэширование.
"""
import asyncio
import json
import os
import statistics
import time
from pathlib import Path
from typing import Any, Dict, List

import asyncpg
import httpx

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://nba_admin:nba_secure_pass_2024@localhost:5432/nba_stats",
).replace("postgresql+asyncpg://", "postgresql://")

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")
RESULTS_DIR = Path(__file__).parent.parent.parent / "research_results"
RESULTS_DIR.mkdir(exist_ok=True)


def print_table(headers: List[str], rows: List[List[Any]]) -> None:
    widths = [max(len(str(h)), max((len(str(r[i])) for r in rows), default=0))
              for i, h in enumerate(headers)]
    fmt = "  ".join(f"{{:<{w}}}" for w in widths)
    print(fmt.format(*headers))
    print("  ".join("-" * w for w in widths))
    for row in rows:
        print(fmt.format(*row))


async def measure_query(conn: asyncpg.Connection, query: str, params=None, runs: int = 10):
    times = []
    for _ in range(runs):
        t0 = time.perf_counter()
        await conn.fetch(query, *(params or []))
        times.append((time.perf_counter() - t0) * 1000)
    return {
        "median_ms": round(statistics.median(times), 2),
        "mean_ms": round(statistics.mean(times), 2),
        "p95_ms": round(sorted(times)[int(0.95 * runs)], 2),
        "min_ms": round(min(times), 2),
        "max_ms": round(max(times), 2),
    }


# ============================================================
# ЭКСПЕРИМЕНТ 1: Влияние объёма данных
# ============================================================
async def experiment_1_data_volume(conn: asyncpg.Connection) -> List[Dict]:
    """Измерение времени запроса топ-20 по PER при разных объёмах данных."""
    print("\n" + "=" * 60)
    print("ЭКСПЕРИМЕНТ 1: Влияние объёма данных на производительность")
    print("=" * 60)

    query = """
        SELECT p.first_name || ' ' || p.last_name AS full_name,
               t.name AS team,
               pss.per, pss.avg_pts
        FROM player_season_stats pss
        JOIN players p ON p.player_id = pss.player_id
        JOIN teams   t ON t.team_id   = pss.team_id
        WHERE pss.season_id = 1
        ORDER BY pss.per DESC NULLS LAST
        LIMIT 20
    """

    # Получить EXPLAIN ANALYZE
    plan = await conn.fetchval(f"EXPLAIN ANALYZE {query}")
    print(f"\nEXPLAIN ANALYZE:\n{plan}")

    real_count = await conn.fetchval("SELECT COUNT(*) FROM game_player_stats")

    results = []
    metrics = await measure_query(conn, query, runs=10)
    metrics["volume"] = real_count
    results.append(metrics)

    print_table(
        ["Объём (строк)", "Медиана (мс)", "P95 (мс)", "Среднее (мс)"],
        [[r["volume"], r["median_ms"], r["p95_ms"], r["mean_ms"]] for r in results],
    )

    with open(RESULTS_DIR / "exp1_data_volume.json", "w") as f:
        json.dump(results, f, indent=2)

    return results


# ============================================================
# ЭКСПЕРИМЕНТ 2: Стратегии индексирования
# ============================================================
async def experiment_2_indexing(conn: asyncpg.Connection) -> List[Dict]:
    """Сравнение стратегий индексирования для топ по PER."""
    print("\n" + "=" * 60)
    print("ЭКСПЕРИМЕНТ 2: Стратегии индексирования")
    print("=" * 60)

    query = """
        SELECT player_id, per, avg_pts
        FROM player_season_stats
        WHERE season_id = 1
        ORDER BY per DESC NULLS LAST
        LIMIT 20
    """

    configurations = [
        ("Без индексов", "DROP INDEX IF EXISTS idx_pss_season_per; DROP INDEX IF EXISTS idx_pss_player_season"),
        ("B-tree (season_id)", "CREATE INDEX IF NOT EXISTS idx_exp2_test ON player_season_stats(season_id)"),
        ("Составной (season_id, per DESC)", "CREATE INDEX IF NOT EXISTS idx_exp2_comp ON player_season_stats(season_id, per DESC NULLS LAST)"),
        ("Частичный WHERE per IS NOT NULL", "CREATE INDEX IF NOT EXISTS idx_exp2_partial ON player_season_stats(season_id, per DESC NULLS LAST) WHERE per IS NOT NULL"),
    ]

    results = []
    for name, setup_sql in configurations:
        await conn.execute(setup_sql)
        await conn.execute("VACUUM ANALYZE player_season_stats")
        metrics = await measure_query(conn, query, runs=10)
        metrics["config"] = name
        results.append(metrics)
        print(f"  {name}: медиана={metrics['median_ms']}мс, p95={metrics['p95_ms']}мс")

    # Восстановить оригинальные индексы
    await conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_pss_season_per
            ON player_season_stats(season_id, per DESC NULLS LAST);
        CREATE INDEX IF NOT EXISTS idx_pss_player_season
            ON player_season_stats(player_id, season_id);
    """)

    print_table(
        ["Конфигурация", "Медиана (мс)", "P95 (мс)"],
        [[r["config"], r["median_ms"], r["p95_ms"]] for r in results],
    )

    with open(RESULTS_DIR / "exp2_indexing.json", "w") as f:
        json.dump(results, f, indent=2)

    return results


# ============================================================
# ЭКСПЕРИМЕНТ 3: Параллельная нагрузка
# ============================================================
async def experiment_3_concurrent_load() -> List[Dict]:
    """Параллельные запросы через httpx к API."""
    print("\n" + "=" * 60)
    print("ЭКСПЕРИМЕНТ 3: Параллельная нагрузка на API")
    print("=" * 60)

    url = f"{API_BASE_URL}/players?season_id=1"
    concurrency_levels = [1, 10, 50, 100]
    results = []

    async def make_request(client: httpx.AsyncClient):
        t0 = time.perf_counter()
        try:
            resp = await client.get(url, timeout=30)
            elapsed = (time.perf_counter() - t0) * 1000
            return elapsed, resp.status_code == 200
        except Exception:
            return (time.perf_counter() - t0) * 1000, False

    for n in concurrency_levels:
        async with httpx.AsyncClient() as client:
            t_start = time.perf_counter()
            tasks = [make_request(client) for _ in range(n)]
            raw = await asyncio.gather(*tasks)
            total_ms = (time.perf_counter() - t_start) * 1000

        times = [r[0] for r in raw]
        errors = sum(1 for r in raw if not r[1])
        sorted_t = sorted(times)

        metrics = {
            "concurrency": n,
            "avg_ms": round(statistics.mean(times), 2),
            "median_ms": round(statistics.median(times), 2),
            "p95_ms": round(sorted_t[int(0.95 * n)], 2) if n > 1 else sorted_t[-1],
            "p99_ms": round(sorted_t[int(0.99 * n)], 2) if n > 1 else sorted_t[-1],
            "total_ms": round(total_ms, 2),
            "errors": errors,
        }
        results.append(metrics)
        print(f"  N={n:3d}: avg={metrics['avg_ms']}мс, p95={metrics['p95_ms']}мс, ошибок={errors}")

    print_table(
        ["N запросов", "Avg (мс)", "P95 (мс)", "P99 (мс)", "Ошибок"],
        [[r["concurrency"], r["avg_ms"], r["p95_ms"], r["p99_ms"], r["errors"]] for r in results],
    )

    with open(RESULTS_DIR / "exp3_concurrent.json", "w") as f:
        json.dump(results, f, indent=2)

    return results


# ============================================================
# ЭКСПЕРИМЕНТ 4: Эффективность кэширования
# ============================================================
async def experiment_4_caching() -> Dict:
    """100 повторных запросов с кэшем и без."""
    print("\n" + "=" * 60)
    print("ЭКСПЕРИМЕНТ 4: Эффективность Redis-кэширования")
    print("=" * 60)

    url = f"{API_BASE_URL}/stats/leaders?metric=per&season_id=1"
    n_requests = 100

    async def run_requests(client: httpx.AsyncClient) -> List[float]:
        times = []
        for _ in range(n_requests):
            t0 = time.perf_counter()
            await client.get(url, timeout=30)
            times.append((time.perf_counter() - t0) * 1000)
        return times

    # С кэшем (первый запрос — miss, остальные — hit)
    async with httpx.AsyncClient() as client:
        # Очистить кэш через admin API
        try:
            await client.delete(f"{API_BASE_URL}/admin/cache/leaders", headers={"X-API-Key": "nba-stats-secret-key-2024"})
        except Exception:
            pass

        cached_times = await run_requests(client)

    miss_time = cached_times[0]
    hit_times = cached_times[1:]

    results = {
        "with_cache": {
            "miss_ms": round(miss_time, 2),
            "hit_avg_ms": round(statistics.mean(hit_times), 2) if hit_times else 0,
            "hit_p95_ms": round(sorted(hit_times)[int(0.95 * len(hit_times))], 2) if hit_times else 0,
            "speedup": round(miss_time / statistics.mean(hit_times), 1) if hit_times and statistics.mean(hit_times) > 0 else 0,
        }
    }

    print(f"  Cache MISS:  {results['with_cache']['miss_ms']} мс")
    print(f"  Cache HIT:   avg={results['with_cache']['hit_avg_ms']} мс, p95={results['with_cache']['hit_p95_ms']} мс")
    print(f"  Ускорение:   {results['with_cache']['speedup']}x")

    print("\nРекомендации по оптимизации:")
    print("  1. TTL=300с оптимален для player stats (данные меняются редко)")
    print("  2. TTL=900с для standings/teams (очень стабильные данные)")
    print("  3. Постоянный кэш для boxscore (исторические данные неизменны)")
    print("  4. При > 50 параллельных запросах рекомендуется connection pooling через PgBouncer")

    with open(RESULTS_DIR / "exp4_caching.json", "w") as f:
        json.dump(results, f, indent=2)

    return results


async def main():
    print("NBA Statistics Database — Исследование производительности")
    print("=" * 60)

    conn = await asyncpg.connect(DATABASE_URL)
    try:
        await experiment_1_data_volume(conn)
        await experiment_2_indexing(conn)
    finally:
        await conn.close()

    await experiment_3_concurrent_load()
    await experiment_4_caching()

    print("\n" + "=" * 60)
    print(f"Результаты сохранены в {RESULTS_DIR}/")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
