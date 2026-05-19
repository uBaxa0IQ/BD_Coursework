from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache import CacheManager, get_cache
from app.config import settings
from app.database import get_db_admin
from app.models.season import Season

router = APIRouter()


@router.delete("/cache/leaders")
async def clear_leaders_cache(
    x_api_key: str = Header(None),
    cache: CacheManager = Depends(get_cache),
):
    """Сброс кэша лидерборда (для исследования Cache Miss / Hit)."""
    if x_api_key != settings.SECRET_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")

    deleted = await cache.delete_pattern("leaders:*")
    return {"status": "ok", "cache_keys_deleted": deleted}


@router.post("/refresh/{season_id}")
async def refresh_season_stats(
    season_id: int,
    x_api_key: str = Header(None),
    db: AsyncSession = Depends(get_db_admin),
    cache: CacheManager = Depends(get_cache),
):
    if x_api_key != settings.SECRET_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")

    # Проверить существование сезона
    result = await db.execute(
        select(Season).where(Season.season_id == season_id)
    )
    season = result.scalar_one_or_none()
    if not season:
        raise HTTPException(status_code=404, detail=f"Season {season_id} not found")

    # Пересчитать статистику
    await db.execute(
        text("CALL update_season_stats(:season_id)"),
        {"season_id": season_id},
    )
    await db.commit()

    # Инвалидация по префиксам для изменённого сезона (Cache-Aside)
    patterns = [
        f"standings:{season_id}",
        f"players_list:{season_id}:*",
        f"leaders:*:{season_id}:*",
        f"team_roster:*:{season_id}",
        f"team_games:*:{season_id}",
        f"advanced:{season_id}",
        f"scatter:{season_id}",
        f"compare:*:*:{season_id}",
        f"league_dashboard:{season_id}",
        f"player_gamelog:*:{season_id}",
        f"player_stats:*:{season_id}",
    ]
    deleted = 0
    for pattern in patterns:
        deleted += await cache.delete_pattern(pattern)
    await cache.delete("league_trends")

    return {
        "status": "ok",
        "season_id": season_id,
        "season_label": season.label,
        "cache_keys_deleted": deleted,
        "message": f"Stats refreshed for season {season.label}",
    }
