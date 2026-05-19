from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache import CacheManager, get_cache
from app.database import get_db_analyst, get_db_reader
from app.models.game import Game
from app.models.game_player_stats import GamePlayerStats
from app.models.player import Player
from app.models.player_season_stats import PlayerSeasonStats
from app.models.position import Position
from app.models.season import Season
from app.models.team import Team
from app.schemas.team import TeamDetailResponse, TeamResponse, StandingsResponse

router = APIRouter()


@router.get("", response_model=List[TeamResponse])
async def get_teams(
    cache: CacheManager = Depends(get_cache),
    db: AsyncSession = Depends(get_db_analyst),
):
    cache_key = "teams_list"
    cached = await cache.get(cache_key)
    if cached:
        return cached

    result = await db.execute(
        select(Team).where(Team.is_active == True).order_by(Team.name)
    )
    teams = result.scalars().all()
    data = [
        {
            "team_id": t.team_id,
            "nba_team_id": t.nba_team_id,
            "name": t.name,
            "abbreviation": t.abbreviation,
            "city": t.city,
            "conference": t.conference,
            "division": t.division,
        }
        for t in teams
    ]
    await cache.set(cache_key, data, ttl=900)
    return data


@router.get("/standings")
async def get_standings(
    season_id: int,
    cache: CacheManager = Depends(get_cache),
    db: AsyncSession = Depends(get_db_reader),
):
    cache_key = f"standings:{season_id}"
    cached = await cache.get(cache_key)
    if cached:
        return cached

    result = await db.execute(
        text("""
            SELECT team_id, name, abbreviation, city, conference, division,
                   nba_team_id, season_id, season, wins, losses, games_played, win_pct
            FROM v_team_standings
            WHERE season_id = :season_id
            ORDER BY win_pct DESC NULLS LAST
        """),
        {"season_id": season_id},
    )
    rows = result.mappings().all()
    standings: Dict[str, list] = {"East": [], "West": []}
    for row in rows:
        r = dict(row)
        conf = r.get("conference", "East")
        if conf in standings:
            standings[conf].append(r)

    await cache.set(cache_key, standings, ttl=900)
    return standings


@router.get("/{team_id}", response_model=TeamDetailResponse)
async def get_team(
    team_id: int,
    cache: CacheManager = Depends(get_cache),
    db: AsyncSession = Depends(get_db_analyst),
):
    cache_key = f"team_detail:{team_id}"
    cached = await cache.get(cache_key)
    if cached:
        return cached

    result = await db.execute(select(Team).where(Team.team_id == team_id))
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    data = {
        "team_id": team.team_id,
        "nba_team_id": team.nba_team_id,
        "name": team.name,
        "abbreviation": team.abbreviation,
        "city": team.city,
        "conference": team.conference,
        "division": team.division,
        "arena_name": team.arena_name,
        "founded_year": team.founded_year,
        "is_active": team.is_active,
    }
    await cache.set(cache_key, data, ttl=900)
    return data


@router.get("/{team_id}/roster")
async def get_team_roster(
    team_id: int,
    season_id: int,
    cache: CacheManager = Depends(get_cache),
    db: AsyncSession = Depends(get_db_analyst),
):
    cache_key = f"team_roster:{team_id}:{season_id}"
    cached = await cache.get(cache_key)
    if cached:
        return cached

    query = (
        select(
            Player.player_id,
            Player.nba_id,
            Player.first_name,
            Player.last_name,
            Position.code.label("position"),
            Player.jersey_number,
            PlayerSeasonStats.games_played,
            PlayerSeasonStats.avg_pts,
            PlayerSeasonStats.avg_reb,
            PlayerSeasonStats.avg_ast,
            PlayerSeasonStats.per,
        )
        .join(PlayerSeasonStats, PlayerSeasonStats.player_id == Player.player_id)
        .outerjoin(Position, Position.position_id == Player.position_id)
        .where(PlayerSeasonStats.team_id == team_id)
        .where(PlayerSeasonStats.season_id == season_id)
        .order_by(PlayerSeasonStats.avg_pts.desc().nulls_last())
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
    await cache.set(cache_key, data, ttl=300)
    return data


@router.get("/{team_id}/games")
async def get_team_games(
    team_id: int,
    season_id: Optional[int] = None,
    cache: CacheManager = Depends(get_cache),
    db: AsyncSession = Depends(get_db_analyst),
):
    cache_key = f"team_games:{team_id}:{season_id}"
    cached = await cache.get(cache_key)
    if cached:
        return cached

    query = (
        select(
            Game.game_id,
            Game.game_date,
            Game.home_score,
            Game.away_score,
            Game.status,
            Game.overtime,
            Game.home_team_id,
            Game.away_team_id,
            Season.label.label("season"),
        )
        .join(Season, Season.season_id == Game.season_id)
        .where(
            (Game.home_team_id == team_id) | (Game.away_team_id == team_id)
        )
        .order_by(Game.game_date.desc())
        .limit(100)
    )
    if season_id:
        query = query.where(Game.season_id == season_id)

    result = await db.execute(query)
    rows = result.mappings().all()
    data = []
    for row in rows:
        r = dict(row)
        if r.get("game_date"):
            r["game_date"] = str(r["game_date"])
        data.append(r)
    await cache.set(cache_key, data, ttl=300)
    return data
