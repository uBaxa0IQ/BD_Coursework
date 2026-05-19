"""
Скрипт загрузки данных NBA в PostgreSQL.
Источник: nba_api (stats.nba.com)
Порядок загрузки критичен из-за FK зависимостей.

Включено (раньше было в repair_after_load.py / fix_positions.py):
  - PlayerCareerStats с league_id_nullable='00' (корректная лига в NBA API)
  - дозаполнение пропусков player_team_history по матчам
  - правка calculate_usg (доля 0–1, как ts_pct; UI ×100) и восстановление вьюх
  - опционально: --refine-positions (CommonPlayerInfo по игрокам с матчами)

Примеры:
  python scripts/load_data.py
  python scripts/load_data.py --sleep 0.65 --timeout 30
  python scripts/load_data.py --sleep 0.5 --cooldown-every 400   # агрессивнее
  python scripts/load_data.py --refine-positions
  python scripts/load_data.py --skip-repair-history --skip-usg-fix
"""
import argparse
import asyncio
import logging
import os
from collections import defaultdict
from datetime import date
from typing import Any, DefaultDict, Dict, Optional, Set

import asyncpg
from nba_api.stats.endpoints import (
    CommonAllPlayers,
    CommonPlayerInfo,
    LeagueGameLog,
    BoxScoreTraditionalV2,
    PlayerCareerStats,
)
from nba_api.stats.static import teams as nba_teams_static
from tqdm import tqdm

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

SEASONS = ["2019-20", "2020-21", "2021-22", "2022-23", "2023-24"]
# Паузы: официального лимита нет; nba_api community ~0.6s OK, <0.5s throttling;
# с 2026 часто отсечка ~500–600 запросов → cooldown_every.
DEFAULT_SLEEP = 0.65
DEFAULT_REQUEST_TIMEOUT = 30
DEFAULT_COOLDOWN_EVERY = 500
DEFAULT_COOLDOWN_SEC = 45.0
RETRY_BACKOFF_SEC = (5.0, 15.0, 45.0)
MAX_RETRIES = 3
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://nba_admin:nba_secure_pass_2024@localhost:5432/nba_stats",
).replace("postgresql+asyncpg://", "postgresql://")

SEASON_DATES = {
    "2019-20": ("2019-10-22", "2020-10-11"),
    "2020-21": ("2020-12-22", "2021-07-20"),
    "2021-22": ("2021-10-19", "2022-06-16"),
    "2022-23": ("2022-10-18", "2023-06-12"),
    "2023-24": ("2023-10-24", "2024-06-17"),
}

DIVISION_TO_CONFERENCE = {
    "Atlantic": "East",
    "Central": "East",
    "Southeast": "East",
    "Northwest": "West",
    "Pacific": "West",
    "Southwest": "West",
}

# CommonAllPlayers / CommonPlayerInfo — максимально полный маппинг к PG/SG/SF/PF/C
POSITION_MAP = {
    "PG": "PG", "SG": "SG", "SF": "SF", "PF": "PF", "C": "C",
    "Guard": "SG",
    "Forward": "SF",
    "Center": "C",
    "Forward-Guard": "SG",
    "Guard-Forward": "SG",
    "Forward-Center": "PF",
    "Center-Forward": "C",
    "G": "SG", "F": "SF",
    "G-F": "SF", "F-G": "SG", "F-C": "PF", "C-F": "C",
    "PG-SG": "PG", "SG-PG": "SG",
    "SG-SF": "SG", "SF-SG": "SF",
    "SF-PF": "SF", "PF-SF": "PF",
    "PF-C": "PF", "C-PF": "C",
}

# Имитация реального браузера для обхода блокировок NBA
CUSTOM_HEADERS = {
    'Host': 'stats.nba.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Referer': 'https://www.nba.com/',
    'Origin': 'https://www.nba.com',
    'Sec-Ch-Ua': '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
}


class LoadSettings:
    """Параметры паузы API (задаются из CLI в main)."""

    def __init__(
        self,
        sleep: float = DEFAULT_SLEEP,
        request_timeout: int = DEFAULT_REQUEST_TIMEOUT,
        cooldown_every: int = DEFAULT_COOLDOWN_EVERY,
        cooldown_sec: float = DEFAULT_COOLDOWN_SEC,
    ):
        self.sleep = sleep
        self.request_timeout = request_timeout
        self.cooldown_every = cooldown_every
        self.cooldown_sec = cooldown_sec


_load_settings = LoadSettings()
_api_call_count = 0


async def _pace_api() -> None:
    """Пауза перед запросом + периодический cooldown под лимит NBA/Akamai."""
    global _api_call_count
    await asyncio.sleep(_load_settings.sleep)
    _api_call_count += 1
    n = _load_settings.cooldown_every
    if n > 0 and _api_call_count % n == 0:
        logger.info(
            "Cooldown %ds после %d запросов к stats.nba.com",
            _load_settings.cooldown_sec,
            _api_call_count,
        )
        await asyncio.sleep(_load_settings.cooldown_sec)


def _retry_sleep(attempt: int) -> float:
    idx = min(attempt, len(RETRY_BACKOFF_SEC) - 1)
    return RETRY_BACKOFF_SEC[idx]


def _iso_date(s: str) -> Optional[date]:
    """Безопасный парсинг даты для asyncpg."""
    if not s:
        return None
    try:
        return date.fromisoformat(s[:10])
    except ValueError:
        return None


async def fetch_nba_api_data(endpoint_class: Any, **kwargs) -> Any:
    """Обертка для выполнения запросов к nba_api с ретраями, заголовками и без блокировки event loop."""
    kwargs['headers'] = CUSTOM_HEADERS
    if 'timeout' not in kwargs:
        kwargs['timeout'] = _load_settings.request_timeout

    for attempt in range(MAX_RETRIES):
        try:
            await _pace_api()
            resp = await asyncio.to_thread(endpoint_class, **kwargs)
            return resp
        except Exception as e:
            backoff = _retry_sleep(attempt)
            logger.warning(
                "Ошибка API %s (попытка %d/%d, пауза %.0fs): %s",
                endpoint_class.__name__, attempt + 1, MAX_RETRIES, backoff, e,
            )
            await asyncio.sleep(backoff)

    raise Exception(f"Не удалось получить данные {endpoint_class.__name__} после {MAX_RETRIES} попыток.")


async def load_teams(conn: asyncpg.Connection) -> Dict[int, int]:
    """Загрузка команд из статических данных NBA API. Возвращает {nba_team_id: team_id}."""
    logger.info("Загрузка команд...")
    all_teams = nba_teams_static.get_teams()
    mapping = {}

    for t in all_teams:
        division = t.get("division", "Atlantic")
        conference = DIVISION_TO_CONFERENCE.get(division, "East")
        try:
            team_id = await conn.fetchval(
                """
                INSERT INTO teams (nba_team_id, name, abbreviation, city, conference, division)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (nba_team_id) DO UPDATE
                    SET name         = EXCLUDED.name,
                        abbreviation = EXCLUDED.abbreviation,
                        city         = EXCLUDED.city,
                        conference   = EXCLUDED.conference,
                        division     = EXCLUDED.division
                RETURNING team_id
                """,
                t["id"], t["full_name"], t["abbreviation"], t["city"], conference, division,
            )
            if team_id:
                mapping[t["id"]] = team_id
        except Exception as e:
            logger.warning("Ошибка при загрузке команды %s: %s", t["full_name"], e)

    logger.info("Загружено команд: %d", len(mapping))
    return mapping


async def load_seasons(conn: asyncpg.Connection) -> Dict[str, int]:
    """Загрузка сезонов. Возвращает {label: season_id}."""
    logger.info("Загрузка сезонов...")
    mapping = {}
    for label, (start, end) in SEASON_DATES.items():
        season_id = await conn.fetchval(
            """
            INSERT INTO seasons (label, start_date, end_date, season_type)
            VALUES ($1, $2, $3, 'Regular')
            ON CONFLICT (label) DO UPDATE SET
                start_date = EXCLUDED.start_date,
                end_date   = EXCLUDED.end_date
            RETURNING season_id
            """,
            label, _iso_date(start), _iso_date(end),
        )
        if season_id:
            mapping[label] = season_id
    logger.info("Загружено сезонов: %d", len(mapping))
    return mapping


async def load_players(conn: asyncpg.Connection) -> Dict[int, int]:
    """Загрузка игроков. Возвращает {nba_id: player_id}."""
    logger.info("Загрузка игроков через CommonAllPlayers...")
    try:
        resp = await fetch_nba_api_data(CommonAllPlayers, is_only_current_season=0)
        df = resp.get_data_frames()[0]
    except Exception as e:
        logger.error("Критическая ошибка при получении списка игроков: %s", e)
        return {}

    # Получить position_id по code из БД
    pos_rows = await conn.fetch("SELECT position_id, code FROM positions")
    pos_map = {r["code"]: r["position_id"] for r in pos_rows}

    mapping = {}
    for _, row in tqdm(df.iterrows(), total=len(df), desc="Игроки"):
        try:
            nba_id = int(row["PERSON_ID"])
            full = str(row.get("DISPLAY_FIRST_LAST", "")).strip()
            parts = full.split(" ", 1)
            first = parts[0] if len(parts) > 0 else ""
            last = parts[1] if len(parts) > 1 else ""
            is_active = bool(row.get("ROSTERSTATUS", 0))

            pos_str = str(row.get("POSITION", "")).strip()
            pos_code = POSITION_MAP.get(pos_str, "SG")
            position_id = pos_map.get(pos_code)

            player_id = await conn.fetchval(
                """
                INSERT INTO players (nba_id, first_name, last_name, is_active, position_id)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (nba_id) DO UPDATE SET
                    first_name  = EXCLUDED.first_name,
                    last_name   = EXCLUDED.last_name,
                    is_active   = EXCLUDED.is_active,
                    position_id = EXCLUDED.position_id
                RETURNING player_id
                """,
                nba_id, first, last, is_active, position_id,
            )
            if player_id:
                mapping[nba_id] = player_id
        except Exception as e:
            logger.debug("Ошибка загрузки игрока %s: %s", row.get("PERSON_ID"), e)

    logger.info("Загружено игроков: %d", len(mapping))
    return mapping


async def load_games(
    conn: asyncpg.Connection, season_label: str, season_id: int, team_map: Dict[int, int]
) -> Dict[str, int]:
    """Загрузка матчей. Возвращает {nba_game_id: game_id}."""
    logger.info("Загрузка матчей для сезона %s...", season_label)
    try:
        resp = await fetch_nba_api_data(LeagueGameLog, season=season_label)
        df = resp.get_data_frames()[0]
    except Exception as e:
        logger.error("Ошибка загрузки матчей %s: %s", season_label, e)
        return {}

    games_data = {}
    
    # Собираем данные по матчу из двух строк (home и away)
    for _, row in df.iterrows():
        gid = str(row["GAME_ID"])
        if gid not in games_data:
            games_data[gid] = {
                "game_date": _iso_date(str(row.get("GAME_DATE", ""))),
                "season_id": season_id,
            }

        matchup = str(row.get("MATCHUP", ""))
        nba_team_id = int(row["TEAM_ID"])
        
        if "vs." in matchup:  # home
            games_data[gid]["home_nba"] = nba_team_id
        elif "@" in matchup:  # away
            games_data[gid]["away_nba"] = nba_team_id

    mapping = {}
    for gid, g in tqdm(games_data.items(), desc=f"Матчи {season_label}"):
        home_nba = g.get("home_nba")
        away_nba = g.get("away_nba")
        
        if not home_nba or not away_nba:
            continue
            
        home_id = team_map.get(home_nba)
        away_id = team_map.get(away_nba)
        
        if not home_id or not away_id:
            continue
            
        try:
            game_id = await conn.fetchval(
                """
                INSERT INTO games (season_id, home_team_id, away_team_id, game_date, status)
                VALUES ($1, $2, $3, $4, 'Finished')
                ON CONFLICT DO NOTHING
                RETURNING game_id
                """,
                g["season_id"], home_id, away_id, g["game_date"],
            )
            if game_id:
                mapping[gid] = game_id
        except Exception as e:
            logger.debug("Ошибка вставки матча %s: %s", gid, e)

    logger.info("Загружено новых матчей для %s: %d", season_label, len(mapping))
    return mapping


async def load_game_stats(
    conn: asyncpg.Connection, game_ids: Dict[str, int], player_map: Dict[int, int], team_map: Dict[int, int]
) -> None:
    """Загрузка статистики игроков по матчам через BoxScore."""
    logger.info("Загрузка статистики по матчам (%d матчей)...", len(game_ids))
    errors = 0

    for nba_game_id, local_game_id in tqdm(game_ids.items(), desc="BoxScores"):
        try:
            resp = await fetch_nba_api_data(BoxScoreTraditionalV2, game_id=nba_game_id)
            df = resp.player_stats.get_data_frame()
        except Exception as e:
            logger.debug("Пропуск BoxScore %s: %s", nba_game_id, e)
            errors += 1
            continue

        records = []
        for _, row in df.iterrows():
            nba_pid = int(row.get("PLAYER_ID", 0))
            nba_tid = int(row.get("TEAM_ID", 0))
            player_id = player_map.get(nba_pid)
            team_id = team_map.get(nba_tid)
            if not player_id or not team_id:
                continue

            min_str = str(row.get("MIN", "") or "0")
            try:
                if ":" in min_str:
                    parts = min_str.split(":")
                    minutes = float(parts[0]) + float(parts[1]) / 60
                else:
                    minutes = float(min_str)
            except Exception:
                minutes = 0.0

            def safe_int(v, default=0):
                try:
                    return int(v) if v is not None and str(v) != "None" else default
                except Exception:
                    return default

            records.append((
                local_game_id, player_id, team_id, round(minutes, 1),
                safe_int(row.get("PTS")), safe_int(row.get("OREB")),
                safe_int(row.get("DREB")), safe_int(row.get("AST")),
                safe_int(row.get("STL")), safe_int(row.get("BLK")),
                safe_int(row.get("TO")), safe_int(row.get("PF")),
                safe_int(row.get("FGM")), safe_int(row.get("FGA")),
                safe_int(row.get("FG3M")), safe_int(row.get("FG3A")),
                safe_int(row.get("FTM")), safe_int(row.get("FTA")),
                safe_int(row.get("PLUS_MINUS")), bool(row.get("START_POSITION", "")),
            ))

        if records:
            try:
                await conn.executemany(
                    """
                    INSERT INTO game_player_stats
                        (game_id, player_id, team_id, minutes_played,
                         points, rebounds_off, rebounds_def, assists,
                         steals, blocks, turnovers, fouls,
                         fgm, fga, fg3m, fg3a, ftm, fta,
                         plus_minus, is_starter)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
                    ON CONFLICT (game_id, player_id) DO NOTHING
                    """,
                    records,
                )
            except Exception as e:
                logger.debug("Ошибка вставки stats %s: %s", nba_game_id, e)

    logger.info("BoxScores загружены. Ошибок скачивания: %d", errors)


async def load_player_history(
    conn: asyncpg.Connection, player_map: Dict[int, int], team_map: Dict[int, int], season_map: Dict[str, int]
) -> None:
    """Загрузка истории команд игроков."""
    logger.info("Загрузка истории команд игроков...")
    nba_ids = list(player_map.keys())  # Обрабатываем всех игроков

    for nba_id in tqdm(nba_ids, desc="История команд"):
        player_id = player_map.get(nba_id)
        if not player_id:
            continue
            
        try:
            resp = await fetch_nba_api_data(
                PlayerCareerStats,
                player_id=nba_id,
                league_id_nullable="00",
            )
            df = resp.get_data_frames()[0]
        except Exception:
            continue

        for _, row in df.iterrows():
            season_label_full = str(row.get("SEASON_ID", ""))
            if len(season_label_full) >= 7:
                season_label = season_label_full[:7]
            else:
                continue

            season_id = season_map.get(season_label)
            if not season_id:
                continue

            nba_tid = int(row.get("TEAM_ID", 0))
            team_id = team_map.get(nba_tid)
            if not team_id:
                continue

            try:
                await conn.execute(
                    """
                    INSERT INTO player_team_history
                        (player_id, team_id, season_id, start_date, contract_type)
                    VALUES ($1, $2, $3, $4, 'Standard')
                    ON CONFLICT DO NOTHING
                    """,
                    player_id,
                    team_id,
                    season_id,
                    _iso_date(SEASON_DATES.get(season_label, ("2020-01-01", "2021-01-01"))[0]),
                )
            except Exception:
                pass

    logger.info("История команд загружена.")


async def print_counts(conn: asyncpg.Connection) -> None:
    tables = [
        "positions", "seasons", "teams", "players",
        "games", "game_player_stats", "player_season_stats", "player_team_history",
    ]
    logger.info("=== ФИНАЛЬНАЯ СТАТИСТИКА ===")
    for table in tables:
        try:
            count = await conn.fetchval(f"SELECT COUNT(*) FROM {table}")
            logger.info("  %-30s %d строк", table, count)
        except asyncpg.UndefinedTableError:
            logger.warning("  %-30s ТАБЛИЦА НЕ СУЩЕСТВУЕТ", table)


# --- Дозаполнение player_team_history (пропуски после первой загрузки карьеры) ---

GAPS_SQL = """
SELECT DISTINCT p.player_id, p.nba_id, g.season_id, s.label AS season_label
FROM game_player_stats gps
JOIN games g ON g.game_id = gps.game_id
JOIN players p ON p.player_id = gps.player_id
JOIN seasons s ON s.season_id = g.season_id
WHERE NOT EXISTS (
    SELECT 1
    FROM player_team_history pth
    WHERE pth.player_id = gps.player_id
      AND pth.season_id = g.season_id
)
ORDER BY p.nba_id, g.season_id;
"""

FIX_USG_SQL = """
DROP VIEW IF EXISTS v_top_players CASCADE;
DROP VIEW IF EXISTS v_player_rankings CASCADE;
ALTER TABLE player_season_stats
    ALTER COLUMN usg_pct TYPE DECIMAL(5,4)
    USING (
        CASE
            WHEN usg_pct IS NULL THEN NULL
            WHEN usg_pct::numeric > 1 THEN usg_pct::numeric / 100.0
            ELSE usg_pct::numeric
        END
    );
"""


async def fetch_missing_history_keys(conn: asyncpg.Connection) -> list:
    return await conn.fetch(GAPS_SQL)


async def insert_history_row(
    conn: asyncpg.Connection,
    player_id: int,
    team_id: int,
    season_id: int,
    start_date: Any,
) -> None:
    await conn.execute(
        """
        INSERT INTO player_team_history
            (player_id, team_id, season_id, start_date, contract_type)
        SELECT $1, $2, $3, $4, 'Standard'
        WHERE NOT EXISTS (
            SELECT 1 FROM player_team_history e
            WHERE e.player_id = $1 AND e.team_id = $2 AND e.season_id = $3
        )
        """,
        player_id,
        team_id,
        season_id,
        start_date,
    )


async def repair_missing_player_team_history(conn: asyncpg.Connection) -> None:
    rows = await fetch_missing_history_keys(conn)
    if not rows:
        logger.info("Пропуски player_team_history не найдены.")
        return

    by_nba: DefaultDict[int, Dict[str, Any]] = defaultdict(dict)
    for r in rows:
        nba_id = int(r["nba_id"])
        pid = int(r["player_id"])
        sid = int(r["season_id"])
        label = str(r["season_label"])
        by_nba[nba_id]["player_id"] = pid
        if "seasons" not in by_nba[nba_id]:
            by_nba[nba_id]["seasons"] = {}
        by_nba[nba_id]["seasons"][label] = sid

    logger.info("Игроков с пропусками истории (по nba_id): %d", len(by_nba))

    failed: list[int] = []
    for nba_id, data in tqdm(by_nba.items(), desc="Дозагрузка истории"):
        player_id: int = data["player_id"]
        season_labels: Dict[str, int] = data["seasons"]
        needed_labels: Set[str] = set(season_labels.keys())

        try:
            resp = await fetch_nba_api_data(
                PlayerCareerStats,
                player_id=nba_id,
                league_id_nullable="00",
            )
            df = resp.get_data_frames()[0]
        except Exception as e:
            logger.warning("nba_id=%s: не удалось получить карьеру: %s", nba_id, e)
            failed.append(nba_id)
            continue

        for _, row in df.iterrows():
            season_full = str(row.get("SEASON_ID", ""))
            if len(season_full) < 7:
                continue
            season_label = season_full[:7]
            if season_label not in needed_labels:
                continue

            season_id = season_labels[season_label]
            try:
                nba_tid = int(row.get("TEAM_ID", 0))
            except (TypeError, ValueError):
                continue
            if nba_tid == 0:
                continue

            team_id = await conn.fetchval(
                "SELECT team_id FROM teams WHERE nba_team_id = $1", nba_tid
            )
            if not team_id:
                continue

            start = SEASON_DATES.get(season_label, ("2020-01-01", "2021-01-01"))[0]
            start_d = _iso_date(start)
            if not start_d:
                continue

            try:
                await insert_history_row(conn, player_id, team_id, season_id, start_d)
            except Exception as ex:
                logger.debug("Вставка истории player=%s season=%s: %s", player_id, season_id, ex)

    if failed:
        logger.warning("Не загружена карьера для nba_id (сохраните список): %s", failed)


async def apply_usg_fix(conn: asyncpg.Connection) -> None:
    """Применить тип колонки, обновлённую calculate_usg и вьюху (как в db/04_functions.sql + 06_views)."""
    try:
        await conn.execute(FIX_USG_SQL)
    except Exception as e:
        logger.warning("ALTER usg_pct / DROP VIEW (возможно уже применено): %s", e)

    usg_sql = """
CREATE OR REPLACE FUNCTION calculate_usg(
    p_player_id INT,
    p_season_id INT,
    p_team_id   INT DEFAULT NULL
)
RETURNS DECIMAL(5,4)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_team_id  INTEGER;
    v_fga      NUMERIC := 0;
    v_fta      NUMERIC := 0;
    v_tov      NUMERIC := 0;
    v_mp       NUMERIC := 0;
    v_tm_fga   NUMERIC := 0;
    v_tm_fta   NUMERIC := 0;
    v_tm_tov   NUMERIC := 0;
    v_tm_mp    NUMERIC := 0;
    v_denom    NUMERIC;
BEGIN
    IF p_team_id IS NOT NULL THEN
        v_team_id := p_team_id;
    ELSE
        SELECT gps.team_id
        INTO v_team_id
        FROM game_player_stats gps
        JOIN games g ON g.game_id = gps.game_id
        WHERE gps.player_id = p_player_id
          AND g.season_id   = p_season_id
        ORDER BY g.game_date DESC
        LIMIT 1;
    END IF;

    IF v_team_id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT
        COALESCE(SUM(gps.fga), 0),
        COALESCE(SUM(gps.fta), 0),
        COALESCE(SUM(gps.turnovers), 0),
        COALESCE(SUM(gps.minutes_played), 0)
    INTO v_fga, v_fta, v_tov, v_mp
    FROM game_player_stats gps
    JOIN games g ON g.game_id = gps.game_id
    WHERE gps.player_id = p_player_id
      AND g.season_id   = p_season_id
      AND (p_team_id IS NULL OR gps.team_id = p_team_id);

    IF v_mp < 1 THEN
        RETURN NULL;
    END IF;

    SELECT
        COALESCE(SUM(gps2.fga), 0),
        COALESCE(SUM(gps2.fta), 0),
        COALESCE(SUM(gps2.turnovers), 0),
        COALESCE(SUM(gps2.minutes_played), 0)
    INTO v_tm_fga, v_tm_fta, v_tm_tov, v_tm_mp
    FROM game_player_stats gps2
    JOIN games g2 ON g2.game_id = gps2.game_id
    WHERE gps2.team_id  = v_team_id
      AND g2.season_id  = p_season_id
      AND gps2.game_id IN (
          SELECT gps3.game_id
          FROM game_player_stats gps3
          JOIN games g3 ON g3.game_id = gps3.game_id
          WHERE gps3.player_id = p_player_id
            AND g3.season_id = p_season_id
            AND (p_team_id IS NULL OR gps3.team_id = p_team_id)
      );

    v_denom := v_mp * (v_tm_fga + 0.44 * v_tm_fta + v_tm_tov);

    IF v_denom = 0 THEN
        RETURN NULL;
    END IF;

    RETURN ROUND(
        (v_fga + 0.44 * v_fta + v_tov) * (v_tm_mp / 5.0) / v_denom,
        4
    );
END;
$$;
"""
    await conn.execute(usg_sql)
    logger.info("Функция calculate_usg обновлена (TmMP/5, опциональный team_id; доля 0–1)")

    # Как в db/06_views.sql — иначе ломается v_top_players (зависит от колонок v_player_rankings)
    v_rankings = """
CREATE OR REPLACE VIEW v_player_rankings AS
SELECT
    p.player_id,
    p.first_name || ' ' || p.last_name  AS full_name,
    p.nba_id,
    t.name                               AS team_name,
    t.abbreviation,
    t.nba_team_id,
    pos.code                             AS position,
    s.label                              AS season,
    s.season_id,
    pss.games_played,
    pss.avg_pts,
    pss.avg_reb,
    pss.avg_ast,
    pss.avg_stl,
    pss.avg_blk,
    pss.avg_tov,
    pss.avg_min,
    pss.fg_pct,
    pss.fg3_pct,
    pss.ft_pct,
    pss.avg_plus_minus,
    pss.efg_pct,
    pss.ts_pct,
    pss.usg_pct,
    pss.per,
    pss.bpm
FROM player_season_stats pss
JOIN players   p   ON p.player_id   = pss.player_id
JOIN teams     t   ON t.team_id     = pss.team_id
JOIN seasons   s   ON s.season_id   = pss.season_id
LEFT JOIN positions pos ON pos.position_id = p.position_id
ORDER BY pss.per DESC NULLS LAST
"""
    v_top = """
CREATE OR REPLACE VIEW v_top_players AS
SELECT
    full_name,
    team_name,
    position,
    season,
    avg_pts,
    avg_reb,
    avg_ast,
    per
FROM v_player_rankings
WHERE per IS NOT NULL
ORDER BY per DESC
"""
    try:
        await conn.execute(v_rankings)
        await conn.execute(v_top)
        await conn.execute("GRANT SELECT ON v_player_rankings TO analyst, db_admin")
        await conn.execute("GRANT SELECT ON v_top_players TO reader, analyst, db_admin")
        logger.info("Вьюхи v_player_rankings и v_top_players восстановлены (как в db/06_views.sql)")
    except Exception as e:
        logger.error("Ошибка восстановления вьюх: %s", e)


async def refine_positions_from_common_player_info(conn: asyncpg.Connection) -> None:
    """Уточнение позиций через CommonPlayerInfo (медленно)."""
    pos_rows = await conn.fetch("SELECT position_id, code FROM positions ORDER BY position_id")
    pos_map = {r["code"]: r["position_id"] for r in pos_rows}

    players = await conn.fetch("""
        SELECT DISTINCT p.player_id, p.nba_id, p.first_name, p.last_name
        FROM players p
        JOIN game_player_stats gps ON gps.player_id = p.player_id
        ORDER BY p.nba_id
    """)
    logger.info("Уточнение позиций (CommonPlayerInfo): %d игроков с матчами", len(players))

    updated = 0
    skipped_api_fail = 0
    skipped_no_pos = 0
    unknown_positions: set = set()

    for row in tqdm(players, desc="Позиции (API)"):
        nba_id = int(row["nba_id"])
        player_id = int(row["player_id"])

        pos_code: Optional[str] = None
        for attempt in range(MAX_RETRIES):
            try:
                await _pace_api()
                resp = await asyncio.to_thread(
                    CommonPlayerInfo,
                    player_id=nba_id,
                    headers=CUSTOM_HEADERS,
                    timeout=_load_settings.request_timeout,
                )
                df = resp.get_data_frames()[0]
                if df.empty:
                    break
                pos_str = str(df.iloc[0].get("POSITION", "")).strip()
                pos_code = POSITION_MAP.get(pos_str)
                break
            except Exception as e:
                logger.debug("nba_id=%s попытка %d/%d: %s", nba_id, attempt + 1, MAX_RETRIES, e)
                await asyncio.sleep(_retry_sleep(attempt))

        if pos_code is None:
            skipped_api_fail += 1
            continue

        position_id = pos_map.get(pos_code)
        if not position_id:
            unknown_positions.add(pos_code)
            skipped_no_pos += 1
            continue

        await conn.execute(
            "UPDATE players SET position_id = $1 WHERE player_id = $2",
            position_id,
            player_id,
        )
        updated += 1

    logger.info("Позиции: обновлено %d, ошибки API %d, неизвестный код %d", updated, skipped_api_fail, skipped_no_pos)
    if unknown_positions:
        logger.warning("Неизвестные коды позиций: %s", unknown_positions)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Загрузка NBA stats в PostgreSQL")
    p.add_argument(
        "--sleep",
        type=float,
        default=float(os.getenv("NBA_LOAD_SLEEP", DEFAULT_SLEEP)),
        help=f"Пауза перед запросом, с (по умолчанию {DEFAULT_SLEEP}, community min ~0.6)",
    )
    p.add_argument(
        "--timeout",
        type=int,
        default=int(os.getenv("NBA_LOAD_TIMEOUT", DEFAULT_REQUEST_TIMEOUT)),
        help=f"HTTP timeout запроса, с (по умолчанию {DEFAULT_REQUEST_TIMEOUT})",
    )
    p.add_argument(
        "--cooldown-every",
        type=int,
        default=int(os.getenv("NBA_LOAD_COOLDOWN_EVERY", DEFAULT_COOLDOWN_EVERY)),
        help=f"Длинная пауза каждые N запросов, 0=выкл (по умолчанию {DEFAULT_COOLDOWN_EVERY})",
    )
    p.add_argument(
        "--cooldown-sec",
        type=float,
        default=float(os.getenv("NBA_LOAD_COOLDOWN_SEC", DEFAULT_COOLDOWN_SEC)),
        help=f"Длительность cooldown, с (по умолчанию {DEFAULT_COOLDOWN_SEC})",
    )
    p.add_argument(
        "--skip-repair-history",
        action="store_true",
        help="Не дозаполнять player_team_history по пропускам",
    )
    p.add_argument(
        "--skip-usg-fix",
        action="store_true",
        help="Не применять правку USG% и вьюху v_player_rankings",
    )
    p.add_argument(
        "--refine-positions",
        action="store_true",
        help="Уточнить позиции через CommonPlayerInfo (долго)",
    )
    return p.parse_args()


async def main() -> None:
    global _load_settings, _api_call_count
    args = parse_args()
    _load_settings = LoadSettings(
        sleep=max(0.0, args.sleep),
        request_timeout=max(5, args.timeout),
        cooldown_every=max(0, args.cooldown_every),
        cooldown_sec=max(0.0, args.cooldown_sec),
    )
    _api_call_count = 0
    logger.info(
        "API pace: sleep=%.2fs timeout=%ds cooldown=%ds каждые %d запросов",
        _load_settings.sleep,
        _load_settings.request_timeout,
        _load_settings.cooldown_sec,
        _load_settings.cooldown_every,
    )
    logger.info("Подключение к БД: %s", DATABASE_URL.split("@")[-1])
    conn = await asyncpg.connect(DATABASE_URL)

    try:
        try:
            await conn.execute("ALTER TABLE game_player_stats DISABLE TRIGGER ALL")
            logger.info("Триггеры отключены.")
        except Exception as e:
            logger.warning("Не удалось отключить триггеры (продолжаем без этого): %s", e)

        team_map = await load_teams(conn)
        season_map = await load_seasons(conn)
        player_map = await load_players(conn)

        all_game_ids: Dict[str, int] = {}
        for season_label in SEASONS:
            sid = season_map.get(season_label)
            if not sid:
                continue
            gids = await load_games(conn, season_label, sid, team_map)
            all_game_ids.update(gids)
            logger.info("Загружено матчей в этом сезоне: %d", len(gids))

        await load_game_stats(conn, all_game_ids, player_map, team_map)
        await load_player_history(conn, player_map, team_map, season_map)

        if args.refine_positions:
            await refine_positions_from_common_player_info(conn)

        if not args.skip_repair_history:
            await repair_missing_player_team_history(conn)

        if not args.skip_usg_fix:
            await apply_usg_fix(conn)

        try:
            await conn.execute("ALTER TABLE game_player_stats ENABLE TRIGGER ALL")
            logger.info("Триггеры включены.")
        except Exception:
            pass

        for season_label, season_id in season_map.items():
            logger.info("Пересчёт статистики для сезона %s (id=%d)...", season_label, season_id)
            try:
                await conn.execute("CALL update_season_stats($1)", season_id)
            except Exception as e:
                logger.error("Ошибка вызова процедуры update_season_stats: %s", e)

        await print_counts(conn)
        logger.info("Загрузка завершена успешно.")

    finally:
        await conn.close()
        logger.info("Соединение с БД закрыто.")


if __name__ == "__main__":
    asyncio.run(main())