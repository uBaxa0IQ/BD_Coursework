"""Одноразовый backfill: счёт матчей из box score + очистка NaN в метриках."""
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.sql.backfill_game_scores import BACKFILL_GAME_SCORES_SQL  # noqa: E402

import asyncpg  # noqa: E402

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://nba_admin:nba_secure_pass_2024@localhost:5432/nba_stats",
).replace("postgresql+asyncpg://", "postgresql://")


async def main() -> None:
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        await conn.execute(BACKFILL_GAME_SCORES_SQL)
    finally:
        await conn.close()
    print("Backfill OK. Restart redis: docker compose restart redis")


if __name__ == "__main__":
    asyncio.run(main())
