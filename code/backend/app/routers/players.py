from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.cache import CacheManager, get_cache
from app.database import get_db_analyst
from app.models.player import Player
from app.models.player_season_stats import PlayerSeasonStats
from app.models.player_team_history import PlayerTeamHistory
from app.models.game_player_stats import GamePlayerStats
from app.models.game import Game
from app.models.season import Season
from app.models.team import Team
from app.models.position import Position
from app.schemas.player import PlayerResponse, PlayerDetailResponse, PlayerStatsResponse, PlayerCareerResponse

router = APIRouter()


@router.get("", response_model=List[PlayerResponse])
async def get_players(
    season_id: int,
    position: Optional[str] = None,
    team_id: Optional[int] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    cache: CacheManager = Depends(get_cache),
    db: AsyncSession = Depends(get_db_analyst),
):
    cache_key = f"players_list:{season_id}:{position}:{team_id}:{search}:{limit}:{offset}"
    cached = await cache.get(cache_key)
    if cached:
        return cached

    query = (
        select(
            Player.player_id,
            Player.nba_id,
            Player.first_name,
            Player.last_name,
            Team.name.label("team_name"),
            Team.abbreviation.label("team_abbreviation"),
            Position.code.label("position"),
            PlayerSeasonStats.games_played,
            PlayerSeasonStats.avg_pts,
            PlayerSeasonStats.avg_reb,
            PlayerSeasonStats.avg_ast,
            PlayerSeasonStats.per,
            PlayerSeasonStats.ts_pct,
        )
        .join(PlayerSeasonStats, PlayerSeasonStats.player_id == Player.player_id)
        .join(Team, Team.team_id == PlayerSeasonStats.team_id)
        .outerjoin(Position, Position.position_id == Player.position_id)
        .where(PlayerSeasonStats.season_id == season_id)
    )

    if position:
        query = query.where(Position.code == position)
    if team_id:
        query = query.where(PlayerSeasonStats.team_id == team_id)
    if search:
        query = query.where(
            (Player.first_name + " " + Player.last_name).ilike(f"%{search}%")
        )

    query = query.order_by(PlayerSeasonStats.per.desc().nulls_last()).limit(limit).offset(offset)

    result = await db.execute(query)
    rows = result.mappings().all()
    data = [dict(row) for row in rows]
    await cache.set(cache_key, data, ttl=120)
    return data


@router.get("/{player_id}", response_model=PlayerDetailResponse)
async def get_player(
    player_id: int,
    cache: CacheManager = Depends(get_cache),
    db: AsyncSession = Depends(get_db_analyst),
):
    cache_key = f"player_detail:{player_id}"
    cached = await cache.get(cache_key)
    if cached:
        return cached

    query = (
        select(
            Player.player_id,
            Player.nba_id,
            Player.first_name,
            Player.last_name,
            Player.birth_date,
            Player.nationality,
            Player.height_cm,
            Player.weight_kg,
            Player.jersey_number,
            Player.is_active,
            Player.draft_year,
            Player.draft_round,
            Player.draft_pick,
            Position.code.label("position"),
            Team.name.label("team_name"),
            Team.abbreviation.label("team_abbreviation"),
            Team.nba_team_id,
        )
        .outerjoin(Position, Position.position_id == Player.position_id)
        .outerjoin(PlayerSeasonStats, PlayerSeasonStats.player_id == Player.player_id)
        .outerjoin(Team, Team.team_id == PlayerSeasonStats.team_id)
        .where(Player.player_id == player_id)
        .order_by(PlayerSeasonStats.season_id.desc().nulls_last())
        .limit(1)
    )
    result = await db.execute(query)
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Player not found")

    data = dict(row)
    if data.get("birth_date"):
        data["birth_date"] = str(data["birth_date"])
    await cache.set(cache_key, data, ttl=300)
    return data


@router.get("/{player_id}/stats", response_model=List[PlayerStatsResponse])
async def get_player_stats(
    player_id: int,
    season_id: Optional[int] = None,
    cache: CacheManager = Depends(get_cache),
    db: AsyncSession = Depends(get_db_analyst),
):
    cache_key = f"player_stats:{player_id}:{season_id or 'all'}"
    cached = await cache.get(cache_key)
    if cached:
        return cached

    query = (
        select(
            Season.label.label("season_label"),
            PlayerSeasonStats.season_id,
            PlayerSeasonStats.games_played,
            PlayerSeasonStats.avg_pts,
            PlayerSeasonStats.avg_reb,
            PlayerSeasonStats.avg_ast,
            PlayerSeasonStats.avg_stl,
            PlayerSeasonStats.avg_blk,
            PlayerSeasonStats.avg_tov,
            PlayerSeasonStats.avg_min,
            PlayerSeasonStats.fg_pct,
            PlayerSeasonStats.fg3_pct,
            PlayerSeasonStats.ft_pct,
            PlayerSeasonStats.avg_plus_minus,
            PlayerSeasonStats.efg_pct,
            PlayerSeasonStats.ts_pct,
            PlayerSeasonStats.usg_pct,
            PlayerSeasonStats.per,
            PlayerSeasonStats.bpm,
        )
        .join(Season, Season.season_id == PlayerSeasonStats.season_id)
        .where(PlayerSeasonStats.player_id == player_id)
        .order_by(Season.season_id)
    )
    if season_id:
        query = query.where(PlayerSeasonStats.season_id == season_id)

    result = await db.execute(query)
    rows = result.mappings().all()
    data = [dict(row) for row in rows]
    await cache.set(cache_key, data, ttl=300)
    return data


@router.get("/{player_id}/gamelog")
async def get_player_gamelog(
    player_id: int,
    season_id: int,
    cache: CacheManager = Depends(get_cache),
    db: AsyncSession = Depends(get_db_analyst),
):
    cache_key = f"player_gamelog:{player_id}:{season_id}"
    cached = await cache.get(cache_key)
    if cached:
        return cached

    query = (
        select(
            Game.game_id,
            Game.game_date,
            Team.abbreviation.label("opponent"),
            GamePlayerStats.points,
            (GamePlayerStats.rebounds_off + GamePlayerStats.rebounds_def).label("rebounds"),
            GamePlayerStats.assists,
            GamePlayerStats.minutes_played,
            GamePlayerStats.plus_minus,
            GamePlayerStats.fgm,
            GamePlayerStats.fga,
            GamePlayerStats.fg3m,
            GamePlayerStats.fg3a,
            GamePlayerStats.ftm,
            GamePlayerStats.fta,
            GamePlayerStats.steals,
            GamePlayerStats.blocks,
            GamePlayerStats.turnovers,
        )
        .join(Game, Game.game_id == GamePlayerStats.game_id)
        .join(
            Team,
            (
                (Game.home_team_id == Team.team_id) &
                (GamePlayerStats.team_id != Team.team_id)
            ) | (
                (Game.away_team_id == Team.team_id) &
                (GamePlayerStats.team_id != Team.team_id)
            )
        )
        .join(Season, Season.season_id == Game.season_id)
        .where(GamePlayerStats.player_id == player_id)
        .where(Season.season_id == season_id)
        .order_by(Game.game_date.desc())
    )

    result = await db.execute(query)
    rows = result.mappings().all()
    data = []
    for row in rows:
        r = dict(row)
        if r.get("game_date"):
            r["game_date"] = str(r["game_date"])
        data.append(r)
    await cache.set(cache_key, data, ttl=180)
    return data


@router.get("/{player_id}/career", response_model=PlayerCareerResponse)
async def get_player_career(
    player_id: int,
    cache: CacheManager = Depends(get_cache),
    db: AsyncSession = Depends(get_db_analyst),
):
    cache_key = f"player_career:{player_id}"
    cached = await cache.get(cache_key)
    if cached:
        return cached

    player_q = select(Player).where(Player.player_id == player_id)
    player_res = await db.execute(player_q)
    player = player_res.scalar_one_or_none()
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")

    stats_q = (
        select(
            Season.label.label("season_label"),
            PlayerSeasonStats.season_id,
            PlayerSeasonStats.games_played,
            PlayerSeasonStats.avg_pts,
            PlayerSeasonStats.avg_reb,
            PlayerSeasonStats.avg_ast,
            PlayerSeasonStats.avg_stl,
            PlayerSeasonStats.avg_blk,
            PlayerSeasonStats.avg_tov,
            PlayerSeasonStats.avg_min,
            PlayerSeasonStats.fg_pct,
            PlayerSeasonStats.fg3_pct,
            PlayerSeasonStats.ft_pct,
            PlayerSeasonStats.avg_plus_minus,
            PlayerSeasonStats.efg_pct,
            PlayerSeasonStats.ts_pct,
            PlayerSeasonStats.usg_pct,
            PlayerSeasonStats.per,
            PlayerSeasonStats.bpm,
        )
        .join(Season, Season.season_id == PlayerSeasonStats.season_id)
        .where(PlayerSeasonStats.player_id == player_id)
        .order_by(Season.season_id)
    )
    stats_res = await db.execute(stats_q)
    seasons = []
    for r in stats_res.mappings().all():
        item = dict(r)
        for k, v in item.items():
            if v is not None and str(v) == "NaN":
                item[k] = None
        seasons.append(item)

    data = {
        "player_id": player.player_id,
        "full_name": f"{player.first_name} {player.last_name}",
        "photo_url": f"https://cdn.nba.com/headshots/nba/latest/1040x760/{player.nba_id}.png",
        "seasons": seasons,
    }
    await cache.set(cache_key, data, ttl=600)
    return data


@router.get("/{player_id}/teams")
async def get_player_teams(
    player_id: int,
    cache: CacheManager = Depends(get_cache),
    db: AsyncSession = Depends(get_db_analyst),
):
    cache_key = f"player_teams:{player_id}"
    cached = await cache.get(cache_key)
    if cached:
        return cached

    query = (
        select(
            Team.name.label("team_name"),
            Team.abbreviation,
            Team.nba_team_id,
            Season.label.label("season"),
            PlayerTeamHistory.start_date,
            PlayerTeamHistory.end_date,
            PlayerTeamHistory.contract_type,
        )
        .join(Team, Team.team_id == PlayerTeamHistory.team_id)
        .join(Season, Season.season_id == PlayerTeamHistory.season_id)
        .where(PlayerTeamHistory.player_id == player_id)
        .order_by(Season.season_id.desc())
    )
    result = await db.execute(query)
    rows = result.mappings().all()
    data = []
    for row in rows:
        r = dict(row)
        if r.get("start_date"):
            r["start_date"] = str(r["start_date"])
        if r.get("end_date"):
            r["end_date"] = str(r["end_date"])
        data.append(r)
    await cache.set(cache_key, data, ttl=600)
    return data
