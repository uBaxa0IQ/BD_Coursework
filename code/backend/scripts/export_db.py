"""
Выгрузка БД NBA в CSV (бэкап-сейв).

Каждая таблица → отдельный CSV с заголовком и id-колонками (формат COPY ... CSV HEADER).
Выгружаются 8 базовых таблиц (нужны для восстановления) и 4 представления
(для удобства анализа; при загрузке обратно они игнорируются — пересоздаются из db/).

Парность: восстановление — scripts/import_db.py.

Примеры:
  python scripts/export_db.py                          # -> data/csv_export
  python scripts/export_db.py --out data/csv_2021-2026 # в отдельную подпапку
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from pathlib import Path

import asyncpg

# На Windows дефолтный Proactor event loop рвёт соединение asyncpg (WinError 64).
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data"

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://nba_admin:nba_secure_pass_2024@localhost:5432/nba_stats",
).replace("postgresql+asyncpg://", "postgresql://")

# Базовые таблицы — в порядке внешних ключей (для парности с import_db.py)
BASE_TABLES = [
    "positions", "seasons", "teams", "players",
    "games", "game_player_stats", "player_season_stats", "player_team_history",
]
# Представления — выгружаются для удобства, при загрузке не используются
VIEWS = ["v_player_rankings", "v_team_standings", "v_team_stats", "v_top_players"]


async def dump_relation(conn: asyncpg.Connection, name: str, out_dir: Path) -> int:
    """COPY (SELECT * FROM name) TO файл CSV. Возвращает число строк."""
    path = out_dir / f"{name}.csv"
    await conn.copy_from_query(
        f"SELECT * FROM {name}", output=str(path), format="csv", header=True
    )
    rows = await conn.fetchval(f"SELECT COUNT(*) FROM {name}")
    logger.info("  %-22s %8d строк -> %s", name, rows, path.name)
    return rows


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Выгрузка БД NBA в CSV")
    p.add_argument("--out", default="csv_export",
                   help="Имя подпапки в data/ или абсолютный путь (по умолчанию csv_export)")
    p.add_argument("--no-views", action="store_true",
                   help="Не выгружать представления, только базовые таблицы")
    return p.parse_args()


async def main() -> None:
    args = parse_args()
    out = Path(args.out)
    out_dir = (out if out.is_absolute() else DATA_DIR / out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    logger.info("Подключение к БД: %s", DATABASE_URL.split("@")[-1])
    logger.info("Каталог выгрузки: %s", out_dir)
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        relations = BASE_TABLES + ([] if args.no_views else VIEWS)
        total = 0
        for name in relations:
            try:
                total += await dump_relation(conn, name, out_dir)
            except asyncpg.UndefinedTableError:
                logger.warning("  %-22s НЕ СУЩЕСТВУЕТ, пропуск", name)
        logger.info("Готово. Файлов: %d, всего строк (с учётом вьюх): %d",
                    len(relations), total)
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
