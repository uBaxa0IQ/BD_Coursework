"""
Загрузка данных NBA в PostgreSQL из nba_api (stats.nba.com).

После запуска БД полностью заполнена и посчитана:
  • teams / seasons / positions          — справочники (positions/teams засеяны схемой)
  • players                              — список + биометрия (рост, вес, гражданство,
                                           дата рождения, номер, драфт) и позиция
  • games + home_score/away_score        — матчи и счёт (из box score)
  • game_player_stats                    — статистика по матчам (~200k строк)
  • player_team_history                  — история команд за наши сезоны
  • player_season_stats                  — агрегаты + продвинутые метрики
                                           (PER, BPM, TS%, eFG%, USG%) через CALL update_season_stats

Параллелизм: запросы к API идут с ограничением скорости (rate limiter, как раньше
~0.65с между стартами), но до `--concurrency` запросов «в полёте» одновременно —
ожидания ответов перекрываются. Запись в БД идёт последовательно по мере готовности.

DDL (функции метрик, вьюхи, фиксы) — ответственность db/*.sql (накатываются при init БД),
здесь не дублируется.

Примеры:
  python scripts/load_data.py                       # полная загрузка с биометрией
  python scripts/load_data.py --skip-profiles       # быстрее, без биометрии (поля игроков пустые)
  python scripts/load_data.py --concurrency 10 --sleep 0.6   # агрессивнее
  python scripts/load_data.py --positions-only      # только пересчёт позиций
  python scripts/load_data.py --profiles-only       # только биометрия/позиции игроков с матчами
  python scripts/load_data.py --profiles-only --profiles-all  # биометрия для всех игроков в БД
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import math
import os
import sys
from datetime import date
from typing import Any, Awaitable, Callable, Dict, List, Optional, Sequence, Tuple

import asyncpg
from nba_api.stats.endpoints import (
    CommonAllPlayers,
    CommonPlayerInfo,
    CommonTeamRoster,
    LeagueGameLog,
    BoxScoreTraditionalV2,
    PlayerCareerStats,
)
from nba_api.stats.static import teams as nba_teams_static
from tqdm import tqdm

# Чтобы работал `from app.sql...` при запуске из каталога backend/
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.sql.backfill_game_scores import BACKFILL_GAME_SCORES_SQL  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Конфигурация
# ---------------------------------------------------------------------------

SEASONS = ["2021-22", "2022-23", "2023-24", "2024-25", "2025-26"]

SEASON_DATES: Dict[str, Tuple[str, str]] = {
    "2021-22": ("2021-10-19", "2022-06-16"),
    "2022-23": ("2022-10-18", "2023-06-12"),
    "2023-24": ("2023-10-24", "2024-06-17"),
    "2024-25": ("2024-10-22", "2025-06-22"),
    "2025-26": ("2025-10-21", "2026-06-21"),
}

# Паузы: официального лимита нет; nba_api community ~0.6с OK, <0.5с → throttling Akamai;
# периодическая отсечка ~500–600 запросов → cooldown_every.
DEFAULT_SLEEP = 0.65
DEFAULT_CONCURRENCY = 8
DEFAULT_REQUEST_TIMEOUT = 30
DEFAULT_COOLDOWN_EVERY = 500
DEFAULT_COOLDOWN_SEC = 45.0
RETRY_BACKOFF_SEC = (5.0, 15.0, 45.0)
MAX_RETRIES = 3

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://nba_admin:nba_secure_pass_2024@localhost:5432/nba_stats",
).replace("postgresql+asyncpg://", "postgresql://")

# nba_api.stats.static.teams не содержит conference (только id, name, abbr, city)
TEAM_CONFERENCE: Dict[str, str] = {
    "ATL": "East", "BOS": "East", "BKN": "East", "CHA": "East", "CHI": "East",
    "CLE": "East", "DET": "East", "IND": "East", "MIA": "East", "MIL": "East",
    "NYK": "East", "ORL": "East", "PHI": "East", "TOR": "East", "WAS": "East",
    "DAL": "West", "DEN": "West", "GSW": "West", "HOU": "West", "LAC": "West",
    "LAL": "West", "MEM": "West", "MIN": "West", "NOP": "West", "OKC": "West",
    "PHX": "West", "POR": "West", "SAC": "West", "SAS": "West", "UTA": "West",
}

# CommonTeamRoster / CommonPlayerInfo — маппинг к PG/SG/SF/PF/C
POSITION_MAP = {
    "PG": "PG", "SG": "SG", "SF": "SF", "PF": "PF", "C": "C",
    "Guard": "SG", "Forward": "SF", "Center": "C",
    "Forward-Guard": "SG", "Guard-Forward": "SG",
    "Forward-Center": "PF", "Center-Forward": "C",
    "G": "SG", "F": "SF",
    "G-F": "SF", "F-G": "SG", "F-C": "PF", "C-F": "C",
    "PG-SG": "PG", "SG-PG": "SG", "SG-SF": "SG", "SF-SG": "SF",
    "SF-PF": "SF", "PF-SF": "PF", "PF-C": "PF", "C-PF": "C",
}

# Имитация браузера — обход блокировок NBA/Akamai
CUSTOM_HEADERS = {
    "Host": "stats.nba.com",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Referer": "https://www.nba.com/",
    "Origin": "https://www.nba.com",
    "Sec-Ch-Ua": '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
}


# ---------------------------------------------------------------------------
# Парсинг полей NBA API
# ---------------------------------------------------------------------------

def normalize_position(pos_str: str) -> Optional[str]:
    """Код PG/SG/SF/PF/C или None."""
    if not pos_str:
        return None
    return POSITION_MAP.get(pos_str.strip())


def _iso_date(s: str) -> Optional[date]:
    if not s:
        return None
    try:
        return date.fromisoformat(s[:10])
    except ValueError:
        return None


def _parse_height_cm(height_str: str) -> Optional[int]:
    """NBA API HEIGHT '6-10' → см."""
    if not height_str:
        return None
    s = str(height_str).strip()
    if "-" not in s:
        return None
    feet_str, inch_str = s.split("-", 1)
    try:
        cm = round((int(feet_str) * 12 + int(float(inch_str))) * 2.54)
        if 150 <= cm <= 250:
            return cm
    except (ValueError, IndexError):
        pass
    return None


def _parse_weight_kg(weight_str: str) -> Optional[int]:
    """NBA API WEIGHT в фунтах → кг."""
    if not weight_str:
        return None
    try:
        kg = round(int(str(weight_str).strip()) * 0.453592)
        if 60 <= kg <= 200:
            return kg
    except ValueError:
        pass
    return None


def _parse_small_int(value: Any, lo: int, hi: int) -> Optional[int]:
    if value is None or value == "":
        return None
    s = str(value).strip()
    if s.lower() in ("undrafted", "none", "n/a"):
        return None
    try:
        n = int(s)
        if lo <= n <= hi:
            return n
    except ValueError:
        pass
    return None


def _parse_minutes(raw_min: Any) -> float:
    """NBA API MIN: 'MM:SS', 'MM' или NaN (DNP) → минуты (float, >= 0)."""
    if raw_min is None or (isinstance(raw_min, float) and math.isnan(raw_min)):
        return 0.0
    s = str(raw_min).strip()
    if not s or s.lower() in ("nan", "none"):
        return 0.0
    try:
        if ":" in s:
            mm, ss = s.split(":")[:2]
            minutes = float(mm) + float(ss) / 60
        else:
            minutes = float(s)
        return minutes if math.isfinite(minutes) and minutes >= 0 else 0.0
    except (ValueError, IndexError):
        return 0.0


def _safe_int(v: Any, default: int = 0) -> int:
    try:
        return int(v) if v is not None and str(v) != "None" else default
    except (ValueError, TypeError):
        return default


def _player_info_to_fields(row: Any, pos_map: Dict[str, int]) -> Dict[str, Any]:
    """Поля players из строки CommonPlayerInfo."""
    pos_code = normalize_position(str(row.get("POSITION", "")).strip())
    return {
        "nationality": (str(row.get("COUNTRY")).strip() or None) if row.get("COUNTRY") else None,
        "birth_date": _iso_date(str(row.get("BIRTHDATE", "") or "")),
        "height_cm": _parse_height_cm(str(row.get("HEIGHT", "") or "")),
        "weight_kg": _parse_weight_kg(str(row.get("WEIGHT", "") or "")),
        "jersey_number": _parse_small_int(row.get("JERSEY"), 0, 99),
        "draft_year": _parse_small_int(row.get("DRAFT_YEAR"), 1946, 2030),
        "draft_round": _parse_small_int(row.get("DRAFT_ROUND"), 1, 2),
        "draft_pick": _parse_small_int(row.get("DRAFT_NUMBER"), 1, 60),
        "position_id": pos_map.get(pos_code) if pos_code else None,
    }


# ---------------------------------------------------------------------------
# Клиент NBA API: rate limiting + ограниченный параллелизм + ретраи
# ---------------------------------------------------------------------------

class RateLimiter:
    """Резервирует тайм-слоты так, чтобы старты запросов шли не чаще min_interval.

    Параллельные задачи ждут свой слот, но ожидание HTTP-ответа НЕ блокирует
    выдачу следующего слота — поэтому ответы перекрываются. Каждые cooldown_every
    запросов вставляется длинная пауза (под отсечку NBA/Akamai).
    """

    def __init__(self, min_interval: float, cooldown_every: int, cooldown_sec: float):
        self._min_interval = max(0.0, min_interval)
        self._cooldown_every = max(0, cooldown_every)
        self._cooldown_sec = max(0.0, cooldown_sec)
        self._lock = asyncio.Lock()
        self._next = 0.0
        self._count = 0

    async def acquire(self) -> None:
        async with self._lock:
            loop = asyncio.get_running_loop()
            scheduled = max(loop.time(), self._next)
            self._next = scheduled + self._min_interval
            self._count += 1
            if self._cooldown_every and self._count % self._cooldown_every == 0:
                logger.info(
                    "Cooldown %.0fс после %d запросов к stats.nba.com",
                    self._cooldown_sec, self._count,
                )
                self._next += self._cooldown_sec
            delay = scheduled - loop.time()
        if delay > 0:
            await asyncio.sleep(delay)


class NBAClient:
    """Обёртка над nba_api: ограничение скорости, параллелизм, ретраи, без блокировки loop."""

    def __init__(self, settings: "LoadSettings"):
        self.settings = settings
        self.limiter = RateLimiter(
            settings.sleep, settings.cooldown_every, settings.cooldown_sec
        )
        self.semaphore = asyncio.Semaphore(settings.concurrency)

    async def fetch(self, endpoint_class: Any, **kwargs) -> Any:
        """Один запрос к API с ретраями. Бросает исключение после MAX_RETRIES."""
        kwargs["headers"] = CUSTOM_HEADERS
        kwargs.setdefault("timeout", self.settings.request_timeout)
        for attempt in range(MAX_RETRIES):
            await self.limiter.acquire()
            try:
                return await asyncio.to_thread(endpoint_class, **kwargs)
            except Exception as e:
                backoff = RETRY_BACKOFF_SEC[min(attempt, len(RETRY_BACKOFF_SEC) - 1)]
                logger.warning(
                    "Ошибка API %s (попытка %d/%d, пауза %.0fс): %s",
                    endpoint_class.__name__, attempt + 1, MAX_RETRIES, backoff, e,
                )
                if attempt < MAX_RETRIES - 1:
                    await asyncio.sleep(backoff)
        raise RuntimeError(
            f"Не удалось получить {endpoint_class.__name__} после {MAX_RETRIES} попыток"
        )

    async def fetch_df(self, endpoint_class: Any, index: int = 0, **kwargs) -> Optional[Any]:
        """Запрос → DataFrame[index] или None при ошибке/пустом ответе (не бросает)."""
        try:
            resp = await self.fetch(endpoint_class, **kwargs)
            df = resp.get_data_frames()[index]
            return None if df.empty else df
        except Exception as e:
            logger.debug("%s: %s", endpoint_class.__name__, e)
            return None

    async def fetch_df_boxscore(self, game_id: str) -> Optional[Any]:
        """BoxScoreTraditionalV2 → player_stats DataFrame (именованный набор)."""
        try:
            resp = await self.fetch(BoxScoreTraditionalV2, game_id=game_id)
            df = resp.player_stats.get_data_frame()
            return None if df.empty else df
        except Exception as e:
            logger.debug("BoxScore %s: %s", game_id, e)
            return None

    async def fetch_df_roster(self, team_id: int, season: str) -> Optional[Any]:
        """CommonTeamRoster → common_team_roster DataFrame (именованный набор)."""
        try:
            resp = await self.fetch(CommonTeamRoster, team_id=team_id, season=season)
            df = resp.common_team_roster.get_data_frame()
            return None if df is None or df.empty else df
        except Exception as e:
            logger.debug("Roster %s %s: %s", team_id, season, e)
            return None


class LoadSettings:
    def __init__(
        self,
        sleep: float = DEFAULT_SLEEP,
        concurrency: int = DEFAULT_CONCURRENCY,
        request_timeout: int = DEFAULT_REQUEST_TIMEOUT,
        cooldown_every: int = DEFAULT_COOLDOWN_EVERY,
        cooldown_sec: float = DEFAULT_COOLDOWN_SEC,
    ):
        self.sleep = max(0.0, sleep)
        self.concurrency = max(1, concurrency)
        self.request_timeout = max(5, request_timeout)
        self.cooldown_every = max(0, cooldown_every)
        self.cooldown_sec = max(0.0, cooldown_sec)


# ---------------------------------------------------------------------------
# Параллельная карта: fetch (concurrent) → handle (serial, для записи в БД)
# ---------------------------------------------------------------------------

async def run_concurrent(
    items: Sequence[Any],
    fetch_fn: Callable[[Any], Awaitable[Any]],
    handle_fn: Optional[Callable[[Any], Awaitable[None]]],
    *,
    concurrency: int,
    desc: str,
) -> None:
    """fetch_fn(item) выполняется параллельно (ограничено rate limiter'ом),
    handle_fn(result) — последовательно в основном цикле (безопасно для одного conn).
    fetch_fn должна сама ловить свои ошибки и возвращать None, чтобы один сбой
    не ронял весь прогон."""
    sem = asyncio.Semaphore(concurrency)

    async def worker(item: Any) -> Any:
        async with sem:
            return await fetch_fn(item)

    tasks = [asyncio.create_task(worker(it)) for it in items]
    for fut in tqdm(asyncio.as_completed(tasks), total=len(tasks), desc=desc):
        result = await fut
        if handle_fn is not None and result is not None:
            await handle_fn(result)


# ---------------------------------------------------------------------------
# Загрузка справочников
# ---------------------------------------------------------------------------

async def load_teams(conn: asyncpg.Connection) -> Dict[int, int]:
    """Команды из статики NBA API. Возвращает {nba_team_id: team_id}."""
    logger.info("Загрузка команд...")
    mapping: Dict[int, int] = {}
    for t in nba_teams_static.get_teams():
        conference = TEAM_CONFERENCE.get(t["abbreviation"], "East")
        try:
            team_id = await conn.fetchval(
                """
                INSERT INTO teams (nba_team_id, name, abbreviation, city, conference)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (nba_team_id) DO UPDATE
                    SET name = EXCLUDED.name, abbreviation = EXCLUDED.abbreviation,
                        city = EXCLUDED.city, conference = EXCLUDED.conference
                RETURNING team_id
                """,
                t["id"], t["full_name"], t["abbreviation"], t["city"], conference,
            )
            if team_id:
                mapping[t["id"]] = team_id
        except Exception as e:
            logger.warning("Команда %s: %s", t["full_name"], e)
    logger.info("Загружено команд: %d", len(mapping))
    return mapping


async def load_seasons(conn: asyncpg.Connection) -> Dict[str, int]:
    """Сезоны. Возвращает {label: season_id}."""
    logger.info("Загрузка сезонов...")
    mapping: Dict[str, int] = {}
    for label, (start, end) in SEASON_DATES.items():
        season_id = await conn.fetchval(
            """
            INSERT INTO seasons (label, start_date, end_date, season_type)
            VALUES ($1, $2, $3, 'Regular')
            ON CONFLICT (label) DO UPDATE
                SET start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date
            RETURNING season_id
            """,
            label, _iso_date(start), _iso_date(end),
        )
        if season_id:
            mapping[label] = season_id
    logger.info("Загружено сезонов: %d", len(mapping))
    return mapping


async def load_players(conn: asyncpg.Connection, client: NBAClient) -> Dict[int, int]:
    """Список игроков (CommonAllPlayers). Возвращает {nba_id: player_id}.
    Биометрия/позиция заполняются позже (enrich_profiles / load_positions)."""
    logger.info("Загрузка игроков (CommonAllPlayers)...")
    df = await client.fetch_df(CommonAllPlayers, is_only_current_season=0)
    if df is None:
        logger.error("Не удалось получить список игроков")
        return {}

    mapping: Dict[int, int] = {}
    for _, row in tqdm(df.iterrows(), total=len(df), desc="Игроки"):
        try:
            nba_id = int(row["PERSON_ID"])
            full = str(row.get("DISPLAY_FIRST_LAST", "")).strip()
            first, _, last = full.partition(" ")
            player_id = await conn.fetchval(
                """
                INSERT INTO players (nba_id, first_name, last_name, is_active, position_id)
                VALUES ($1, $2, $3, $4, NULL)
                ON CONFLICT (nba_id) DO UPDATE
                    SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
                        is_active = EXCLUDED.is_active
                RETURNING player_id
                """,
                nba_id, first, last, bool(row.get("ROSTERSTATUS", 0)),
            )
            if player_id:
                mapping[nba_id] = player_id
        except Exception as e:
            logger.debug("Игрок %s: %s", row.get("PERSON_ID"), e)
    logger.info("Загружено игроков: %d", len(mapping))
    return mapping


# ---------------------------------------------------------------------------
# Матчи и статистика
# ---------------------------------------------------------------------------

async def load_games(
    conn: asyncpg.Connection, client: NBAClient,
    season_label: str, season_id: int, team_map: Dict[int, int],
) -> Dict[str, int]:
    """Матчи сезона (LeagueGameLog). Возвращает {nba_game_id: game_id}."""
    df = await client.fetch_df(LeagueGameLog, season=season_label)
    if df is None:
        logger.error("Не удалось загрузить матчи %s", season_label)
        return {}

    # Матч в логе — две строки (home + away), собираем в одну запись
    games: Dict[str, Dict[str, Any]] = {}
    for _, row in df.iterrows():
        gid = str(row["GAME_ID"])
        g = games.setdefault(gid, {"game_date": _iso_date(str(row.get("GAME_DATE", "")))})
        matchup = str(row.get("MATCHUP", ""))
        if "vs." in matchup:
            g["home_nba"] = int(row["TEAM_ID"])
        elif "@" in matchup:
            g["away_nba"] = int(row["TEAM_ID"])

    mapping: Dict[str, int] = {}
    for gid, g in games.items():
        home_id = team_map.get(g.get("home_nba"))
        away_id = team_map.get(g.get("away_nba"))
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
                season_id, home_id, away_id, g["game_date"],
            )
            if game_id:
                mapping[gid] = game_id
        except Exception as e:
            logger.debug("Матч %s: %s", gid, e)
    logger.info("Сезон %s: новых матчей %d", season_label, len(mapping))
    return mapping


def _boxscore_to_records(
    df: Any, local_game_id: int,
    player_map: Dict[int, int], team_map: Dict[int, int],
) -> List[Tuple]:
    records: List[Tuple] = []
    for _, row in df.iterrows():
        player_id = player_map.get(_safe_int(row.get("PLAYER_ID")))
        team_id = team_map.get(_safe_int(row.get("TEAM_ID")))
        if not player_id or not team_id:
            continue
        records.append((
            local_game_id, player_id, team_id, round(_parse_minutes(row.get("MIN")), 1),
            _safe_int(row.get("PTS")), _safe_int(row.get("OREB")), _safe_int(row.get("DREB")),
            _safe_int(row.get("AST")), _safe_int(row.get("STL")), _safe_int(row.get("BLK")),
            _safe_int(row.get("TO")), _safe_int(row.get("PF")),
            _safe_int(row.get("FGM")), _safe_int(row.get("FGA")),
            _safe_int(row.get("FG3M")), _safe_int(row.get("FG3A")),
            _safe_int(row.get("FTM")), _safe_int(row.get("FTA")),
            _safe_int(row.get("PLUS_MINUS")), bool(row.get("START_POSITION", "")),
        ))
    return records


async def load_game_stats(
    conn: asyncpg.Connection, client: NBAClient,
    game_ids: Dict[str, int], player_map: Dict[int, int], team_map: Dict[int, int],
) -> None:
    """Box scores по всем матчам — параллельно по сети, запись последовательно."""
    logger.info("Загрузка box scores (%d матчей, параллелизм %d)...",
                len(game_ids), client.settings.concurrency)
    errors = 0

    async def fetch(item: Tuple[str, int]) -> Optional[List[Tuple]]:
        nonlocal errors
        nba_game_id, local_game_id = item
        df = await client.fetch_df_boxscore(nba_game_id)
        if df is None:
            errors += 1
            return None
        return _boxscore_to_records(df, local_game_id, player_map, team_map)

    async def write(records: List[Tuple]) -> None:
        if not records:
            return
        try:
            await conn.executemany(
                """
                INSERT INTO game_player_stats
                    (game_id, player_id, team_id, minutes_played, points,
                     rebounds_off, rebounds_def, assists, steals, blocks,
                     turnovers, fouls, fgm, fga, fg3m, fg3a, ftm, fta,
                     plus_minus, is_starter)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
                ON CONFLICT (game_id, player_id) DO NOTHING
                """,
                records,
            )
        except Exception as e:
            logger.debug("Вставка box score: %s", e)

    await run_concurrent(
        list(game_ids.items()), fetch, write,
        concurrency=client.settings.concurrency, desc="BoxScores",
    )
    logger.info("Box scores загружены. Ошибок скачивания: %d", errors)


async def players_with_games(conn: asyncpg.Connection) -> List[asyncpg.Record]:
    """Игроки, реально сыгравшие в наших сезонах (а не весь исторический список API)."""
    return await conn.fetch(
        """
        SELECT p.player_id, p.nba_id
        FROM players p
        WHERE EXISTS (SELECT 1 FROM game_player_stats gps WHERE gps.player_id = p.player_id)
        ORDER BY p.nba_id
        """
    )


async def load_player_history(
    conn: asyncpg.Connection, client: NBAClient,
    team_map: Dict[int, int], season_map: Dict[str, int],
) -> None:
    """История команд (player_team_history) по карьере (PlayerCareerStats).

    Только игроки с матчами в наших сезонах — это закрывает все пропуски за один
    проход (раньше для этого был отдельный repair-этап по ~5000 игроков)."""
    players = await players_with_games(conn)
    logger.info("История команд: %d игроков с матчами (параллелизм %d)",
                len(players), client.settings.concurrency)

    async def fetch(rec: asyncpg.Record) -> Optional[List[Tuple[int, int, int, date]]]:
        df = await client.fetch_df(PlayerCareerStats, player_id=int(rec["nba_id"]),
                                   league_id_nullable="00")
        if df is None:
            return None
        player_id = int(rec["player_id"])
        rows: List[Tuple[int, int, int, date]] = []
        for _, r in df.iterrows():
            label = str(r.get("SEASON_ID", ""))[:7]
            season_id = season_map.get(label)
            if not season_id:
                continue
            team_id = team_map.get(_safe_int(r.get("TEAM_ID")))
            if not team_id:  # пропускаем в т.ч. строку TOT (TEAM_ID=0)
                continue
            start = _iso_date(SEASON_DATES[label][0])
            if start:
                rows.append((player_id, team_id, season_id, start))
        return rows or None

    async def write(rows: List[Tuple[int, int, int, date]]) -> None:
        try:
            await conn.executemany(
                """
                INSERT INTO player_team_history
                    (player_id, team_id, season_id, start_date, contract_type)
                VALUES ($1, $2, $3, $4, 'Standard')
                ON CONFLICT (player_id, season_id, team_id) DO NOTHING
                """,
                rows,
            )
        except Exception as e:
            logger.debug("Вставка истории: %s", e)

    await run_concurrent(
        players, fetch, write,
        concurrency=client.settings.concurrency, desc="История команд",
    )
    logger.info("История команд загружена.")


# ---------------------------------------------------------------------------
# Позиции и биометрия
# ---------------------------------------------------------------------------

async def load_positions_from_rosters(conn: asyncpg.Connection, client: NBAClient) -> int:
    """Позиции из CommonTeamRoster (30 команд × сезоны). Поздний сезон побеждает."""
    pos_map = {r["code"]: r["position_id"]
               for r in await conn.fetch("SELECT position_id, code FROM positions")}
    await conn.execute("UPDATE players SET position_id = NULL")

    teams = nba_teams_static.get_teams()
    items = [(int(t["id"]), season) for season in SEASONS for t in teams]
    logger.info("Загрузка позиций из ростеров: %d запросов (параллелизм %d)",
                len(items), client.settings.concurrency)

    nba_id_to_code: Dict[int, str] = {}

    async def fetch(item: Tuple[int, str]) -> Optional[Dict[int, str]]:
        nba_team_id, season = item
        df = await client.fetch_df_roster(nba_team_id, season)
        if df is None:
            return None
        result: Dict[int, str] = {}
        for _, row in df.iterrows():
            try:
                code = normalize_position(str(row.get("POSITION", "")))
                if code:
                    result[int(row["PLAYER_ID"])] = code
            except (TypeError, ValueError, KeyError):
                continue
        return result or None

    async def collect(result: Dict[int, str]) -> None:
        nba_id_to_code.update(result)  # поздние сезоны перезаписывают ранние

    await run_concurrent(items, fetch, collect,
                         concurrency=client.settings.concurrency, desc="Ростеры")

    updated = 0
    for nba_id, code in nba_id_to_code.items():
        position_id = pos_map.get(code)
        if not position_id:
            continue
        status = await conn.execute(
            "UPDATE players SET position_id = $1 WHERE nba_id = $2", position_id, nba_id
        )
        if status.split()[-1] != "0":
            updated += 1
    logger.info("Ростеры: игроков с позицией %d, обновлено строк %d",
                len(nba_id_to_code), updated)
    return updated


async def enrich_profiles(
    conn: asyncpg.Connection, client: NBAClient,
    *, only_with_stats: bool = True, only_missing: bool = True, update_position: bool = True,
) -> None:
    """Биометрия (рост, вес, гражданство, дата рождения, номер, драфт) и позиция
    через CommonPlayerInfo. По умолчанию — игроки с матчами, только пустые поля."""
    pos_map = {r["code"]: r["position_id"]
               for r in await conn.fetch("SELECT position_id, code FROM positions")}

    filters = ["TRUE"]
    if only_with_stats:
        filters.append(
            "EXISTS (SELECT 1 FROM game_player_stats gps WHERE gps.player_id = p.player_id)"
        )
    if only_missing:
        parts = ["p.nationality IS NULL", "p.birth_date IS NULL", "p.height_cm IS NULL",
                 "p.weight_kg IS NULL", "p.jersey_number IS NULL", "p.draft_year IS NULL"]
        if update_position:
            parts.append("p.position_id IS NULL")
        filters.append(f"({' OR '.join(parts)})")

    players = await conn.fetch(
        f"SELECT p.player_id, p.nba_id FROM players p "
        f"WHERE {' AND '.join(filters)} ORDER BY p.nba_id"
    )
    logger.info("Биометрия (CommonPlayerInfo): %d игроков%s%s (параллелизм %d)",
                len(players),
                ", с матчами" if only_with_stats else ", все в БД",
                ", только пропуски" if only_missing else ", принудительно",
                client.settings.concurrency)

    stats = {"updated": 0, "api_fail": 0, "empty": 0}

    async def fetch(rec: asyncpg.Record) -> Optional[Tuple[int, Dict[str, Any]]]:
        df = await client.fetch_df(CommonPlayerInfo, player_id=int(rec["nba_id"]))
        if df is None:
            stats["api_fail"] += 1
            return None
        fields = _player_info_to_fields(df.iloc[0], pos_map)
        if not update_position:
            fields.pop("position_id", None)
        if not any(v is not None for v in fields.values()):
            stats["empty"] += 1
            return None
        return int(rec["player_id"]), fields

    async def write(item: Tuple[int, Dict[str, Any]]) -> None:
        player_id, f = item
        # COALESCE($x, col): не перетираем уже заполненное (важно при принудительном режиме)
        await conn.execute(
            """
            UPDATE players SET
                nationality   = COALESCE($1, nationality),
                birth_date    = COALESCE($2, birth_date),
                height_cm     = COALESCE($3, height_cm),
                weight_kg     = COALESCE($4, weight_kg),
                jersey_number = COALESCE($5, jersey_number),
                draft_year    = COALESCE($6, draft_year),
                draft_round   = COALESCE($7, draft_round),
                draft_pick    = COALESCE($8, draft_pick),
                position_id   = COALESCE($9, position_id)
            WHERE player_id = $10
            """,
            f.get("nationality"), f.get("birth_date"), f.get("height_cm"),
            f.get("weight_kg"), f.get("jersey_number"), f.get("draft_year"),
            f.get("draft_round"), f.get("draft_pick"), f.get("position_id"), player_id,
        )
        stats["updated"] += 1

    await run_concurrent(players, fetch, write,
                         concurrency=client.settings.concurrency, desc="Биометрия")
    logger.info("Биометрия: обновлено %d, ошибки API %d, пустой ответ %d",
                stats["updated"], stats["api_fail"], stats["empty"])


# NBA API (CommonTeamRoster/CommonPlayerInfo) отдаёт позицию только грубо —
# Guard/Forward/Center, без деления PG/SG и SF/PF. Поэтому базовый маппинг
# никогда не даёт PG, а защитники все валятся в SG. Доразмечаем по игровой роли,
# используя статистику матчей (минимум 50 минут за всё время):
#   • защитник (SG) → PG, если передач в среднем больше, чем подборов (плеймейкер);
#   • форвард (SF) → PF, если подборов >= 6.5 за игру или рост >= 206 см (силовой).
REFINE_POSITIONS_SQL = """
WITH agg AS (
    SELECT gps.player_id,
           AVG(gps.assists)                          AS ast,
           AVG(gps.rebounds_off + gps.rebounds_def)  AS reb,
           SUM(gps.minutes_played)                   AS mp
    FROM game_player_stats gps
    GROUP BY gps.player_id
)
UPDATE players p
SET position_id = (SELECT position_id FROM positions WHERE code = 'PG')
FROM agg
WHERE p.player_id = agg.player_id
  AND agg.mp >= 50
  AND p.position_id = (SELECT position_id FROM positions WHERE code = 'SG')
  AND agg.ast > agg.reb;

WITH agg AS (
    SELECT gps.player_id,
           AVG(gps.rebounds_off + gps.rebounds_def)  AS reb,
           SUM(gps.minutes_played)                   AS mp
    FROM game_player_stats gps
    GROUP BY gps.player_id
)
UPDATE players p
SET position_id = (SELECT position_id FROM positions WHERE code = 'PF')
FROM agg
WHERE p.player_id = agg.player_id
  AND agg.mp >= 50
  AND p.position_id = (SELECT position_id FROM positions WHERE code = 'SF')
  AND (agg.reb >= 6.5 OR COALESCE(p.height_cm, 0) >= 206);
"""


async def refine_positions_from_stats(conn: asyncpg.Connection) -> None:
    """Доразметка PG/SG и SF/PF по игровой статистике (API даёт только G/F/C)."""
    await conn.execute(REFINE_POSITIONS_SQL)
    dist = await conn.fetch(
        """
        SELECT pos.code, COUNT(*) AS n
        FROM players p
        JOIN positions pos ON pos.position_id = p.position_id
        WHERE EXISTS (SELECT 1 FROM game_player_stats g WHERE g.player_id = p.player_id)
        GROUP BY pos.code ORDER BY n DESC
        """
    )
    logger.info("Позиции после доразметки: %s",
                {r["code"]: r["n"] for r in dist})


# ---------------------------------------------------------------------------
# Пересчёт агрегатов и финальная статистика
# ---------------------------------------------------------------------------

async def recalc_season_stats(conn: asyncpg.Connection, season_map: Dict[str, int]) -> None:
    """CALL update_season_stats для каждого сезона (PER/BPM/TS%/eFG%/USG% — функции из db/04)."""
    for label, season_id in season_map.items():
        logger.info("Пересчёт агрегатов сезона %s...", label)
        try:
            await conn.execute("CALL update_season_stats($1)", season_id)
        except Exception as e:
            logger.error("update_season_stats(%s): %s", label, e)


async def backfill_game_scores(conn: asyncpg.Connection) -> None:
    """Счёт матчей из box score + очистка NaN в метриках (db/07_backfill_game_scores.sql)."""
    try:
        await conn.execute(BACKFILL_GAME_SCORES_SQL)
        logger.info("Backfill: счёт матчей и очистка NaN.")
    except Exception as e:
        logger.warning("Backfill не выполнен: %s", e)


async def print_counts(conn: asyncpg.Connection) -> None:
    tables = ["positions", "seasons", "teams", "players", "games",
              "game_player_stats", "player_season_stats", "player_team_history"]
    logger.info("=== ФИНАЛЬНАЯ СТАТИСТИКА ===")
    for table in tables:
        try:
            count = await conn.fetchval(f"SELECT COUNT(*) FROM {table}")
            logger.info("  %-22s %d строк", table, count)
        except asyncpg.UndefinedTableError:
            logger.warning("  %-22s ТАБЛИЦА НЕ СУЩЕСТВУЕТ", table)
    try:
        with_stats = await conn.fetchval(
            "SELECT COUNT(*) FROM players p WHERE EXISTS "
            "(SELECT 1 FROM game_player_stats gps WHERE gps.player_id = p.player_id)"
        )
        for col in ("height_cm", "nationality", "position_id"):
            n = await conn.fetchval(f"SELECT COUNT(*) FROM players WHERE {col} IS NOT NULL")
            logger.info("  players.%-14s %d заполнено (из %d с матчами)", col, n, with_stats)
    except asyncpg.UndefinedTableError:
        pass


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Загрузка NBA stats в PostgreSQL")
    p.add_argument("--sleep", type=float,
                   default=float(os.getenv("NBA_LOAD_SLEEP", DEFAULT_SLEEP)),
                   help=f"Мин. интервал между стартами запросов, с (по умолч. {DEFAULT_SLEEP})")
    p.add_argument("--concurrency", type=int,
                   default=int(os.getenv("NBA_LOAD_CONCURRENCY", DEFAULT_CONCURRENCY)),
                   help=f"Параллельных запросов «в полёте» (по умолч. {DEFAULT_CONCURRENCY})")
    p.add_argument("--timeout", type=int,
                   default=int(os.getenv("NBA_LOAD_TIMEOUT", DEFAULT_REQUEST_TIMEOUT)),
                   help=f"HTTP timeout, с (по умолч. {DEFAULT_REQUEST_TIMEOUT})")
    p.add_argument("--cooldown-every", type=int,
                   default=int(os.getenv("NBA_LOAD_COOLDOWN_EVERY", DEFAULT_COOLDOWN_EVERY)),
                   help=f"Длинная пауза каждые N запросов, 0=выкл (по умолч. {DEFAULT_COOLDOWN_EVERY})")
    p.add_argument("--cooldown-sec", type=float,
                   default=float(os.getenv("NBA_LOAD_COOLDOWN_SEC", DEFAULT_COOLDOWN_SEC)),
                   help=f"Длительность cooldown, с (по умолч. {DEFAULT_COOLDOWN_SEC})")
    p.add_argument("--skip-profiles", action="store_true",
                   help="Не загружать биометрию (быстрее, но поля игроков останутся пустыми)")
    p.add_argument("--profiles-force", action="store_true",
                   help="Перезаписать биометрию даже у заполненных полей")
    # Частичные режимы (без полной перезагрузки матчей)
    p.add_argument("--positions-only", action="store_true",
                   help="Только пересчёт позиций из ростеров")
    p.add_argument("--profiles-only", action="store_true",
                   help="Только биометрия/позиции игроков (по умолч. с матчами)")
    p.add_argument("--profiles-all", action="store_true",
                   help="С --profiles-only: все игроки в БД, не только с матчами")
    return p.parse_args()


async def main() -> None:
    args = parse_args()
    settings = LoadSettings(
        sleep=args.sleep, concurrency=args.concurrency, request_timeout=args.timeout,
        cooldown_every=args.cooldown_every, cooldown_sec=args.cooldown_sec,
    )
    client = NBAClient(settings)
    logger.info(
        "Параметры: sleep=%.2fс concurrency=%d timeout=%dс cooldown=%.0fс/%d запросов",
        settings.sleep, settings.concurrency, settings.request_timeout,
        settings.cooldown_sec, settings.cooldown_every,
    )
    logger.info("Подключение к БД: %s", DATABASE_URL.split("@")[-1])
    conn = await asyncpg.connect(DATABASE_URL)

    try:
        # --- Частичные режимы ---
        if args.profiles_only:
            await enrich_profiles(conn, client, only_with_stats=not args.profiles_all,
                                  only_missing=not args.profiles_force)
            await print_counts(conn)
            return
        if args.positions_only:
            await load_positions_from_rosters(conn, client)
            await refine_positions_from_stats(conn)
            await print_counts(conn)
            return

        # --- Полная загрузка ---
        try:
            await conn.execute("ALTER TABLE game_player_stats DISABLE TRIGGER ALL")
            logger.info("Триггеры отключены.")
        except Exception as e:
            logger.warning("Не удалось отключить триггеры: %s", e)

        team_map = await load_teams(conn)
        season_map = await load_seasons(conn)
        player_map = await load_players(conn, client)

        all_game_ids: Dict[str, int] = {}
        for label in SEASONS:
            sid = season_map.get(label)
            if sid:
                all_game_ids.update(await load_games(conn, client, label, sid, team_map))

        await load_game_stats(conn, client, all_game_ids, player_map, team_map)
        await load_player_history(conn, client, team_map, season_map)
        await load_positions_from_rosters(conn, client)
        if not args.skip_profiles:
            await enrich_profiles(conn, client, only_with_stats=True,
                                  only_missing=not args.profiles_force)
        await refine_positions_from_stats(conn)

        try:
            await conn.execute("ALTER TABLE game_player_stats ENABLE TRIGGER ALL")
            logger.info("Триггеры включены.")
        except Exception:
            pass

        await recalc_season_stats(conn, season_map)
        await backfill_game_scores(conn)
        await print_counts(conn)
        logger.info("Загрузка завершена успешно.")
    finally:
        await conn.close()
        logger.info("Соединение с БД закрыто.")


if __name__ == "__main__":
    asyncio.run(main())
