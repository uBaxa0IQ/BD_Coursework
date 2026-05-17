"""
Синтетическое заполнение PostgreSQL теми же порядками объёма, что и load_data.py:
  • матчи: 5 сезонов × ~1230 регулярных игр (NBA)
  • game_player_stats: ~200 000 строк
  • player_season_stats: пересчёт через CALL update_season_stats (~3k строк при ≥20 мин за сезон)
  • player_team_history: порядка нескольких тысяч записей
  • players: несколько тысяч строк (как «полный» список из API)

Команды:
  python scripts/load_synthetic_data.py --reset     # очистить игроков/матчи/статы, справочники не трогать
  python scripts/load_synthetic_data.py             # добавить к существующим данным (риск дублей матчей)

Триггеры на game_player_stats отключаются на время вставки (как load_data.py), затем
CALL update_season_stats для каждого сезона — без лишних пересчётов после каждого батча.
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import os
import random
from datetime import date, timedelta
from typing import Any, Dict, List, Sequence, Tuple

import asyncpg
from tqdm import tqdm

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://nba_admin:nba_secure_pass_2024@localhost:5432/nba_stats",
).replace("postgresql+asyncpg://", "postgresql://")

# Как в load_data.py
SEASON_LABELS = ["2019-20", "2020-21", "2021-22", "2022-23", "2023-24"]
SEASON_DATES: Dict[str, Tuple[str, str]] = {
    "2019-20": ("2019-10-22", "2020-10-11"),
    "2020-21": ("2020-12-22", "2021-07-20"),
    "2021-22": ("2021-10-19", "2022-06-16"),
    "2022-23": ("2022-10-18", "2023-06-12"),
    "2023-24": ("2023-10-24", "2024-06-17"),
}

# Целевые объёмы (см. db/01_schema.sql, PLAN.MD)
GAMES_PER_SEASON = 1230
PLAYERS_IN_DB = 4200
ROSTER_PER_TEAM = 20
PLAYERS_PER_TEAM_IN_BOXSCORE = 16
NBA_SYNTH_ID_BASE = 10_000_000
BATCH_GPS = 4000


def _d(s: str) -> date:
    return date.fromisoformat(s[:10])


def round_robin_pairings(team_ids: Sequence[int], rng: random.Random) -> List[Tuple[int, int]]:
    """Один полный круг: C(n,2) матчей, дом/гость случайно."""
    t = list(team_ids)
    rng.shuffle(t)
    out: List[Tuple[int, int]] = []
    for i in range(len(t)):
        for j in range(i + 1, len(t)):
            a, b = t[i], t[j]
            out.append((a, b) if rng.random() < 0.5 else (b, a))
    return out


def build_season_schedule(team_ids: List[int], rng: random.Random) -> List[Tuple[int, int]]:
    """~1230 игр: несколько полных кругов комбинаций (30 команд → 435 пар за круг)."""
    pairs: List[Tuple[int, int]] = []
    while len(pairs) < GAMES_PER_SEASON:
        pairs.extend(round_robin_pairings(team_ids, rng))
    return pairs[:GAMES_PER_SEASON]


def spread_dates(start: date, end: date, n: int, rng: random.Random) -> List[date]:
    """Несколько матчей в день — как в календаре NBA (даты с повторениями)."""
    span = max(0, (end - start).days)
    return [start + timedelta(days=rng.randint(0, span) if span else 0) for _ in range(n)]


def synth_shooting(rng: random.Random, minutes: float) -> Tuple[int, int, int, int, int, int, int]:
    """fgm,fga,fg3m,fg3a,ftm,fta,pts — с ограничениями схемы."""
    scale = max(0.15, min(1.0, minutes / 32.0))
    fga = rng.randint(0, max(0, int(22 * scale + rng.randint(-2, 3))))
    fgm = rng.randint(0, fga) if fga else 0
    fg3a = rng.randint(0, min(fga, max(0, int(10 * scale + 2)))) if fga else 0
    fg3m = rng.randint(0, min(fgm, fg3a))
    fta = rng.randint(0, max(0, int(10 * scale + rng.randint(0, 2))))
    ftm = rng.randint(0, fta) if fta else 0
    pts = (fgm - fg3m) * 2 + fg3m * 3 + ftm
    pts = min(60, max(0, pts + rng.randint(-2, 4)))
    return fgm, fga, fg3m, fg3a, ftm, fta, pts


def synth_line(rng: random.Random, slot: int, minutes: float) -> Tuple[Any, ...]:
    fgm, fga, fg3m, fg3a, ftm, fta, pts = synth_shooting(rng, minutes)
    reb_o = rng.randint(0, min(6, int(minutes / 5)))
    reb_d = rng.randint(0, min(12, int(minutes / 3)))
    ast = rng.randint(0, min(15, int(minutes / 2)))
    stl = rng.randint(0, min(5, int(minutes / 10)))
    blk = rng.randint(0, min(6, int(minutes / 8)))
    tov = rng.randint(0, min(8, max(1, int(minutes / 6))))
    pf = rng.randint(0, 6)
    pm = rng.randint(-25, 25)
    starter = slot < 5
    return (
        round(minutes, 1),
        pts,
        reb_o,
        reb_d,
        ast,
        stl,
        blk,
        tov,
        pf,
        fgm,
        fga,
        fg3m,
        fg3a,
        ftm,
        fta,
        pm,
        starter,
    )


async def reset_tables(conn: asyncpg.Connection) -> None:
    """Очистка данных; триггеры game_player_stats остаются OFF до конца массовой вставки."""
    await conn.execute("ALTER TABLE game_player_stats DISABLE TRIGGER ALL")
    await conn.execute(
        "TRUNCATE game_player_stats, player_season_stats, player_team_history, games, players "
        "RESTART IDENTITY CASCADE"
    )
    logger.info("Таблицы players, games, game_player_stats, player_season_stats, player_team_history очищены.")


async def load_synthetic_players(conn: asyncpg.Connection, rng: random.Random) -> List[int]:
    pos_rows = await conn.fetch("SELECT position_id FROM positions ORDER BY position_id")
    pos_ids = [int(r["position_id"]) for r in pos_rows]
    if not pos_ids:
        raise RuntimeError("Таблица positions пуста — примените db/01_schema.sql")

    player_ids: List[int] = []
    for i in tqdm(range(PLAYERS_IN_DB), desc="Игроки"):
        nba_id = NBA_SYNTH_ID_BASE + i
        pid = await conn.fetchval(
            """
            INSERT INTO players (nba_id, first_name, last_name, is_active, position_id)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING player_id
            """,
            nba_id,
            "Synth",
            f"Player{i:05d}",
            rng.random() < 0.25,
            rng.choice(pos_ids),
        )
        player_ids.append(int(pid))
    logger.info("Вставлено игроков: %d", len(player_ids))
    return player_ids


def assign_season_rosters(
    all_players: List[int],
    team_ids: List[int],
    season_idx: int,
    rng: random.Random,
) -> Dict[int, List[int]]:
    """У каждой команды ROSTER_PER_TEAM игроков на сезон; каждый сезон — новая выборка из пула."""
    needed = len(team_ids) * ROSTER_PER_TEAM
    if len(all_players) < needed:
        raise RuntimeError(f"Нужно минимум {needed} игроков в БД, сейчас {len(all_players)}")
    sub = random.Random(rng.randint(1, 10**9) + season_idx * 100_003)
    picked = sub.sample(all_players, needed)
    rosters: Dict[int, List[int]] = {}
    k = 0
    for tid in team_ids:
        rosters[tid] = picked[k : k + ROSTER_PER_TEAM]
        k += ROSTER_PER_TEAM
    return rosters


async def print_counts(conn: asyncpg.Connection) -> None:
    for table in (
        "positions",
        "seasons",
        "teams",
        "players",
        "games",
        "game_player_stats",
        "player_season_stats",
        "player_team_history",
    ):
        try:
            n = await conn.fetchval(f"SELECT COUNT(*) FROM {table}")
            logger.info("  %-28s %d", table, n)
        except asyncpg.UndefinedTableError:
            logger.warning("  %-28s (нет таблицы)", table)


async def main_async(args: argparse.Namespace) -> None:
    rng = random.Random(args.seed)
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        if args.reset:
            await reset_tables(conn)
        try:
            await conn.execute("ALTER TABLE game_player_stats DISABLE TRIGGER ALL")
            logger.info("Триггеры game_player_stats отключены на время массовой вставки.")
        except Exception as e:
            logger.warning("Не удалось отключить триггеры: %s", e)

        teams = await conn.fetch(
            "SELECT team_id FROM teams ORDER BY team_id"
        )
        team_ids = [int(r["team_id"]) for r in teams]
        if len(team_ids) < 2:
            raise RuntimeError("В БД нет команд — примените db/01_schema.sql")

        seasons = await conn.fetch(
            "SELECT season_id, label FROM seasons WHERE label = ANY($1::text[])",
            SEASON_LABELS,
        )
        season_by_label = {str(r["label"]): int(r["season_id"]) for r in seasons}
        for lbl in SEASON_LABELS:
            if lbl not in season_by_label:
                raise RuntimeError(f"Нет сезона {lbl} в таблице seasons")

        if args.reset or await conn.fetchval("SELECT COUNT(*) FROM players") == 0:
            player_ids = await load_synthetic_players(conn, rng)
        else:
            player_ids = [int(r["player_id"]) for r in await conn.fetch("SELECT player_id FROM players ORDER BY player_id")]
            if len(player_ids) < len(team_ids) * ROSTER_PER_TEAM:
                raise RuntimeError(
                    "Мало игроков в БД для синтетического расписания без --reset. "
                    "Запустите с --reset или загрузите игроков."
                )
            logger.info("Используются существующие игроки: %d", len(player_ids))

        gps_sql = """
            INSERT INTO game_player_stats
                (game_id, player_id, team_id, minutes_played,
                 points, rebounds_off, rebounds_def, assists,
                 steals, blocks, turnovers, fouls,
                 fgm, fga, fg3m, fg3a, ftm, fta,
                 plus_minus, is_starter)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
        """

        total_games = 0
        total_stats = 0

        for si, label in enumerate(SEASON_LABELS):
            season_id = season_by_label[label]
            start_d, end_d = SEASON_DATES[label]
            start, end = _d(start_d), _d(end_d)
            rosters = assign_season_rosters(player_ids, team_ids, si, rng)
            schedule = build_season_schedule(team_ids, rng)
            game_dates = spread_dates(start, end, len(schedule), rng)

            # История команд за сезон
            for tid, plist in rosters.items():
                for pid in plist:
                    await conn.execute(
                        """
                        INSERT INTO player_team_history
                            (player_id, team_id, season_id, start_date, contract_type)
                        VALUES ($1, $2, $3, $4, 'Standard')
                        """,
                        pid,
                        tid,
                        season_id,
                        start,
                    )

            batch: List[Tuple[Any, ...]] = []
            for (home_id, away_id), gd in tqdm(
                zip(schedule, game_dates),
                total=len(schedule),
                desc=f"Матчи {label}",
            ):
                hs = rng.randint(95, 130)
                aws = rng.randint(95, 130)
                gid = await conn.fetchval(
                    """
                    INSERT INTO games
                        (season_id, home_team_id, away_team_id, game_date, status,
                         home_score, away_score)
                    VALUES ($1, $2, $3, $4, 'Finished', $5, $6)
                    RETURNING game_id
                    """,
                    season_id,
                    home_id,
                    away_id,
                    gd,
                    hs,
                    aws,
                )
                total_games += 1

                for tid in (home_id, away_id):
                    roster = rosters[tid]
                    rng.shuffle(roster)
                    participants = roster[:PLAYERS_PER_TEAM_IN_BOXSCORE]
                    for slot, pid in enumerate(participants):
                        if slot < 5:
                            minutes = rng.uniform(22.0, 38.0)
                        else:
                            minutes = rng.uniform(4.0, 22.0)
                        line = synth_line(rng, slot, minutes)
                        batch.append(
                            (gid, pid, tid)
                            + line
                        )
                        total_stats += 1
                        if len(batch) >= BATCH_GPS:
                            await conn.executemany(gps_sql, batch)
                            batch.clear()

            if batch:
                await conn.executemany(gps_sql, batch)
                batch.clear()

        try:
            await conn.execute("ALTER TABLE game_player_stats ENABLE TRIGGER ALL")
            logger.info("Триггеры game_player_stats включены; пересчёт сезонов.")
        except Exception as e:
            logger.warning("Не удалось включить триггеры: %s", e)

        for label in SEASON_LABELS:
            sid = season_by_label[label]
            try:
                await conn.execute("CALL update_season_stats($1)", sid)
            except Exception as e:
                logger.error("update_season_stats(%s): %s", label, e)

        logger.info("=== Итог генерации ===")
        logger.info("Матчей добавлено (этот запуск): %d", total_games)
        logger.info("Строк game_player_stats (этот запуск): %d", total_stats)
        await print_counts(conn)
    finally:
        await conn.close()


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Синтетические данные NBA-объёма в PostgreSQL")
    p.add_argument(
        "--reset",
        action="store_true",
        help="Очистить players/games/stats/history и заполнить заново",
    )
    p.add_argument("--seed", type=int, default=42, help="Seed RNG для воспроизводимости")
    return p.parse_args()


def main() -> None:
    args = parse_args()
    asyncio.run(main_async(args))


if __name__ == "__main__":
    main()
