"""
Загрузка БД NBA из CSV-сейва (восстановление из бэкапа export_db.py).

Восстанавливает 8 базовых таблиц из CSV (id-колонки сохраняются как есть).
Представления (v_*) НЕ загружаются — они пересоздаются скриптами db/ при init БД.

Всё выполняется в ОДНОЙ транзакции: при любой ошибке откат, БД не повреждается.
  1. отключение триггеров game_player_stats (счёт-валидация + автопересчёт витрины);
  2. TRUNCATE базовых таблиц (RESTART IDENTITY CASCADE);
  3. COPY из CSV в порядке внешних ключей (родители раньше детей);
  4. выставление sequence'ов под максимальные id;
  5. включение триггеров.

ВНИМАНИЕ: операция перезаписывает текущие данные БД содержимым из CSV.

Примеры:
  python scripts/import_db.py --in data/csv_2021-2026
  python scripts/import_db.py --in data/csv_export   # старый сейв (2019-20..2023-24)
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

# (таблица, столбец первичного ключа) — в порядке внешних ключей
TABLES = [
    ("positions", "position_id"),
    ("seasons", "season_id"),
    ("teams", "team_id"),
    ("players", "player_id"),
    ("games", "game_id"),
    ("game_player_stats", "stat_id"),
    ("player_season_stats", "pss_id"),
    ("player_team_history", "history_id"),
]


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Загрузка БД NBA из CSV-сейва")
    p.add_argument("--in", dest="src", default="csv_export",
                   help="Имя подпапки в data/ или абсолютный путь (по умолчанию csv_export)")
    return p.parse_args()


async def main() -> None:
    args = parse_args()
    src = Path(args.src)
    src_dir = (src if src.is_absolute() else DATA_DIR / src).resolve()
    if not src_dir.is_dir():
        raise SystemExit(f"Каталог не найден: {src_dir}")

    present = [(t, pk) for t, pk in TABLES if (src_dir / f"{t}.csv").exists()]
    missing = [t for t, _ in TABLES if not (src_dir / f"{t}.csv").exists()]
    if not present:
        raise SystemExit(f"В каталоге нет ни одного CSV базовых таблиц: {src_dir}")
    if missing:
        logger.warning("Нет CSV для таблиц (будут пустыми): %s", ", ".join(missing))

    logger.info("Подключение к БД: %s", DATABASE_URL.split("@")[-1])
    logger.info("Источник CSV: %s", src_dir)
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        async with conn.transaction():
            await conn.execute("ALTER TABLE game_player_stats DISABLE TRIGGER ALL")

            # Очистка всех базовых таблиц одним оператором (CASCADE снимает порядок)
            all_tables = ", ".join(t for t, _ in TABLES)
            await conn.execute(f"TRUNCATE {all_tables} RESTART IDENTITY CASCADE")
            logger.info("Таблицы очищены.")

            for table, _pk in present:
                path = src_dir / f"{table}.csv"
                await conn.copy_to_table(table, source=str(path),
                                         format="csv", header=True)
                n = await conn.fetchval(f"SELECT COUNT(*) FROM {table}")
                logger.info("  %-22s %8d строк <- %s", table, n, path.name)

            # Сдвигаем sequence'ы под загруженные id, иначе новые INSERT'ы конфликтуют
            for table, pk in present:
                await conn.execute(
                    f"SELECT setval(pg_get_serial_sequence('{table}', '{pk}'), "
                    f"GREATEST((SELECT COALESCE(MAX({pk}), 1) FROM {table}), 1))"
                )

            await conn.execute("ALTER TABLE game_player_stats ENABLE TRIGGER ALL")
        logger.info("Загрузка завершена успешно (транзакция зафиксирована).")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
