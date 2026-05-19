from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import Numeric, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache import CacheManager, get_cache
from app.database import get_db_analyst
from app.models.game import Game
from app.models.player import Player
from app.models.player_season_stats import PlayerSeasonStats
from app.models.season import Season
from app.models.team import Team
from app.models.position import Position

router = APIRouter()


@router.get("/seasons")
async def get_seasons(
    cache: CacheManager = Depends(get_cache),
    db: AsyncSession = Depends(get_db_analyst),
):
    cache_key = "league_seasons"
    cached = await cache.get(cache_key)
    if cached:
        return cached

    result = await db.execute(
        select(Season).order_by(Season.season_id)
    )
    seasons = result.scalars().all()
    data = [
        {
            "season_id": s.season_id,
            "label": s.label,
            "season_type": s.season_type,
            "start_date": s.start_date.isoformat(),
            "end_date": s.end_date.isoformat(),
        }
        for s in seasons
    ]
    await cache.set(cache_key, data, ttl=3600)
    return data


@router.get("/trends")
async def get_league_trends(
    cache: CacheManager = Depends(get_cache),
    db: AsyncSession = Depends(get_db_analyst),
):
    cache_key = "league_trends:v2"
    cached = await cache.get(cache_key)
    if cached:
        return cached

    # Средняя сумма очков за матч (хозяева + гости) по завершённым играм
    game_pts_by_season = (
        select(
            Game.season_id.label("g_season_id"),
            func.round(
                func.avg((Game.home_score + Game.away_score).cast(Numeric)), 2
            ).label("avg_total_pts"),
        )
        .where(Game.status == "Finished")
        .where(Game.home_score.isnot(None))
        .where(Game.away_score.isnot(None))
        .group_by(Game.season_id)
    ).subquery()

    query = (
        select(
            Season.season_id,
            Season.label.label("season"),
            game_pts_by_season.c.avg_total_pts,
            func.round(func.avg(PlayerSeasonStats.avg_pts).cast(Numeric), 2).label("avg_pts"),
            func.round(func.avg(PlayerSeasonStats.fg3_pct).cast(Numeric), 4).label("avg_3p_pct"),
            func.round(func.avg(PlayerSeasonStats.avg_min).cast(Numeric), 2).label("avg_min"),
            func.count(func.distinct(PlayerSeasonStats.player_id)).label("active_players"),
        )
        .join(Season, Season.season_id == PlayerSeasonStats.season_id)
        .outerjoin(
            game_pts_by_season,
            game_pts_by_season.c.g_season_id == Season.season_id,
        )
        .where(PlayerSeasonStats.games_played >= 10)
        .group_by(
            Season.season_id,
            Season.label,
            game_pts_by_season.c.avg_total_pts,
        )
        .order_by(Season.season_id)
    )
    result = await db.execute(query)
    rows = result.mappings().all()
    data = []
    for r in rows:
        item = dict(r)
        # Очистка NaN значений
        for k, v in item.items():
            if v is not None and str(v) == "NaN":
                item[k] = None
        data.append(item)
    await cache.set(cache_key, data, ttl=3600)
    return data


@router.get("/dashboard")
async def get_league_dashboard(
    season_id: int,
    cache: CacheManager = Depends(get_cache),
    db: AsyncSession = Depends(get_db_analyst),
):
    cache_key = f"league_dashboard:{season_id}"
    cached = await cache.get(cache_key)
    if cached:
        return cached

    # Агрегаты по лиге
    agg_q = (
        select(
            func.round(func.avg(PlayerSeasonStats.avg_pts).cast(Numeric), 2).label("avg_pts"),
            func.round(func.avg(PlayerSeasonStats.fg3_pct).cast(Numeric), 4).label("avg_3p_pct"),
            func.count(func.distinct(PlayerSeasonStats.player_id)).label("active_players"),
        )
        .where(PlayerSeasonStats.season_id == season_id)
        .where(PlayerSeasonStats.games_played >= 10)
    )
    agg_res = await db.execute(agg_q)
    agg = agg_res.mappings().first() or {}

    # Топ-5 по PER
    top_q = (
        select(
            Player.player_id,
            Player.nba_id,
            (Player.first_name + " " + Player.last_name).label("player_name"),
            Team.name.label("team_name"),
            Team.abbreviation,
            PlayerSeasonStats.per,
            PlayerSeasonStats.avg_pts,
        )
        .join(Player, Player.player_id == PlayerSeasonStats.player_id)
        .join(Team, Team.team_id == PlayerSeasonStats.team_id)
        .where(PlayerSeasonStats.season_id == season_id)
        .where(PlayerSeasonStats.per.isnot(None))
        .where(PlayerSeasonStats.games_played >= 20)
        .order_by(PlayerSeasonStats.per.desc().nulls_last())
        .limit(5)
    )
    top_res = await db.execute(top_q)
    top_players = []
    for r in top_res.mappings().all():
        item = dict(r)
        for k, v in item.items():
            if v is not None and str(v) == "NaN":
                item[k] = None
        top_players.append(item)

    data = {
        "season_id": season_id,
        "avg_pts": str(agg.get("avg_pts")) if agg.get("avg_pts") else None,
        "avg_3p_pct": str(agg.get("avg_3p_pct")) if agg.get("avg_3p_pct") else None,
        "active_players": agg.get("active_players", 0),
        "top_players_per": top_players,
    }
    await cache.set(cache_key, data, ttl=1800)
    return data


@router.get("/search")
async def search(
    q: str = Query(..., min_length=2),
    cache: CacheManager = Depends(get_cache),
    db: AsyncSession = Depends(get_db_analyst),
):
    cache_key = f"search:{q.lower()}"
    cached = await cache.get(cache_key)
    if cached:
        return cached

    players_q = (
        select(
            Player.player_id,
            Player.nba_id,
            Player.first_name,
            Player.last_name,
        )
        .where(
            (Player.first_name + " " + Player.last_name).ilike(f"%{q}%")
        )
        .where(Player.is_active == True)
        .limit(10)
    )
    teams_q = (
        select(Team.team_id, Team.nba_team_id, Team.name, Team.abbreviation, Team.city)
        .where(Team.name.ilike(f"%{q}%"))
        .limit(5)
    )

    p_res = await db.execute(players_q)
    t_res = await db.execute(teams_q)

    players = [
        {
            "player_id": r.player_id,
            "nba_id": r.nba_id,
            "full_name": f"{r.first_name} {r.last_name}",
            "photo_url": f"https://cdn.nba.com/headshots/nba/latest/260x190/{r.nba_id}.png",
        }
        for r in p_res.all()
    ]
    teams = [
        {
            "team_id": r.team_id,
            "nba_team_id": r.nba_team_id,
            "name": r.name,
            "abbreviation": r.abbreviation,
            "city": r.city,
            "logo_url": f"https://cdn.nba.com/logos/nba/{r.nba_team_id}/global/L/logo.svg",
        }
        for r in t_res.all()
    ]

    data = {"players": players, "teams": teams}
    await cache.set(cache_key, data, ttl=120)
    return data
