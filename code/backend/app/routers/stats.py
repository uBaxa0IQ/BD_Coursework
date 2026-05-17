from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache import CacheManager, get_cache
from app.database import get_db
from app.models.game import Game
from app.models.game_player_stats import GamePlayerStats
from app.models.player import Player
from app.models.player_season_stats import PlayerSeasonStats
from app.models.position import Position
from app.models.team import Team
from app.schemas.stats import GamePlayerStatsResponse, LeaderboardEntry

router = APIRouter()

VALID_METRICS = {
    "avg_pts", "avg_reb", "avg_ast", "avg_stl", "avg_blk",
    "per", "ts_pct", "efg_pct", "bpm", "usg_pct",
}


@router.get("/leaders", response_model=List[LeaderboardEntry])
async def get_leaders(
    metric: str = Query(..., description="Метрика для рейтинга"),
    season_id: int = Query(...),
    team_id: Optional[int] = None,
    position: Optional[str] = None,
    min_games: int = 10,
    limit: int = 20,
    cache: CacheManager = Depends(get_cache),
    db: AsyncSession = Depends(get_db),
):
    if metric not in VALID_METRICS:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid metric. Valid: {sorted(VALID_METRICS)}"
        )

    cache_key = f"leaders:{metric}:{season_id}:{team_id}:{position}:{min_games}:{limit}"
    cached = await cache.get(cache_key)
    if cached:
        return cached

    metric_col = getattr(PlayerSeasonStats, metric)

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
            metric_col.label("value"),
        )
        .join(Player, Player.player_id == PlayerSeasonStats.player_id)
        .join(Team, Team.team_id == PlayerSeasonStats.team_id)
        .outerjoin(Position, Position.position_id == Player.position_id)
        .where(PlayerSeasonStats.season_id == season_id)
        .where(PlayerSeasonStats.games_played >= min_games)
        .where(metric_col.isnot(None))
        .order_by(metric_col.desc().nulls_last())
        .limit(limit)
    )

    if team_id:
        query = query.where(PlayerSeasonStats.team_id == team_id)
    if position:
        query = query.where(Position.code == position)

    result = await db.execute(query)
    rows = result.mappings().all()
    data = []
    for i, r in enumerate(rows):
        val = r["value"]
        if val is not None and str(val) == "NaN":
            val = None
        if val is not None:
            val = float(val)

        data.append({
            "rank": i + 1,
            "player_id": r["player_id"],
            "player_name": f"{r['first_name']} {r['last_name']}",
            "team_name": r["team_name"],
            "team_abbreviation": r["team_abbreviation"],
            "nba_id": r["nba_id"],
            "position": r["position"],
            "games_played": r["games_played"],
            "value": val,
            "metric": metric,
        })
    await cache.set(cache_key, data, ttl=900)
    return data


@router.get("/advanced")
async def get_advanced_stats(
    season_id: int,
    cache: CacheManager = Depends(get_cache),
    db: AsyncSession = Depends(get_db),
):
    cache_key = f"advanced:{season_id}"
    cached = await cache.get(cache_key)
    if cached:
        return cached

    query = (
        select(
            Player.player_id,
            Player.nba_id,
            (Player.first_name + " " + Player.last_name).label("player_name"),
            Team.abbreviation.label("team"),
            Position.code.label("position"),
            PlayerSeasonStats.per,
            PlayerSeasonStats.ts_pct,
            PlayerSeasonStats.efg_pct,
            PlayerSeasonStats.usg_pct,
            PlayerSeasonStats.bpm,
            PlayerSeasonStats.avg_min,
            PlayerSeasonStats.games_played,
        )
        .join(Player, Player.player_id == PlayerSeasonStats.player_id)
        .join(Team, Team.team_id == PlayerSeasonStats.team_id)
        .outerjoin(Position, Position.position_id == Player.position_id)
        .where(PlayerSeasonStats.season_id == season_id)
        .where(PlayerSeasonStats.per.isnot(None))
        .order_by(PlayerSeasonStats.per.desc().nulls_last())
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
    await cache.set(cache_key, data, ttl=900)
    return data


@router.get("/scatter")
async def get_scatter_data(
    season_id: int,
    cache: CacheManager = Depends(get_cache),
    db: AsyncSession = Depends(get_db),
):
    cache_key = f"scatter:{season_id}"
    cached = await cache.get(cache_key)
    if cached:
        return cached

    query = (
        select(
            Player.player_id,
            Player.nba_id,
            (Player.first_name + " " + Player.last_name).label("player_name"),
            Team.abbreviation.label("team"),
            PlayerSeasonStats.efg_pct,
            PlayerSeasonStats.avg_pts,
            PlayerSeasonStats.avg_min,
            PlayerSeasonStats.games_played,
        )
        .join(Player, Player.player_id == PlayerSeasonStats.player_id)
        .join(Team, Team.team_id == PlayerSeasonStats.team_id)
        .where(PlayerSeasonStats.season_id == season_id)
        .where(PlayerSeasonStats.efg_pct.isnot(None))
        .where(PlayerSeasonStats.games_played >= 10)
        .order_by(PlayerSeasonStats.efg_pct.desc().nulls_last())
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
    await cache.set(cache_key, data, ttl=900)
    return data


@router.get("/boxscore/{game_id}")
async def get_boxscore(
    game_id: int,
    cache: CacheManager = Depends(get_cache),
    db: AsyncSession = Depends(get_db),
):
    cache_key = f"boxscore:{game_id}"
    cached = await cache.get(cache_key)
    if cached:
        return cached

    game_q = select(Game).where(Game.game_id == game_id)
    game_res = await db.execute(game_q)
    game = game_res.scalar_one_or_none()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    stats_q = (
        select(
            GamePlayerStats,
            Player.first_name,
            Player.last_name,
            Player.nba_id,
        )
        .join(Player, Player.player_id == GamePlayerStats.player_id)
        .where(GamePlayerStats.game_id == game_id)
        .order_by(GamePlayerStats.team_id, GamePlayerStats.minutes_played.desc().nulls_last())
    )
    stats_res = await db.execute(stats_q)
    rows = stats_res.all()

    home_stats, away_stats = [], []
    for row in rows:
        gps, fn, ln, nba_id = row
        s = {
            "stat_id": gps.stat_id,
            "game_id": gps.game_id,
            "player_id": gps.player_id,
            "team_id": gps.team_id,
            "player_name": f"{fn} {ln}",
            "nba_id": nba_id,
            "minutes_played": str(gps.minutes_played) if gps.minutes_played else None,
            "points": gps.points,
            "rebounds_off": gps.rebounds_off,
            "rebounds_def": gps.rebounds_def,
            "assists": gps.assists,
            "steals": gps.steals,
            "blocks": gps.blocks,
            "turnovers": gps.turnovers,
            "fouls": gps.fouls,
            "fgm": gps.fgm,
            "fga": gps.fga,
            "fg3m": gps.fg3m,
            "fg3a": gps.fg3a,
            "ftm": gps.ftm,
            "fta": gps.fta,
            "plus_minus": gps.plus_minus,
            "is_starter": gps.is_starter,
        }
        if gps.team_id == game.home_team_id:
            home_stats.append(s)
        else:
            away_stats.append(s)

    data = {
        "game": {
            "game_id": game.game_id,
            "season_id": game.season_id,
            "home_team_id": game.home_team_id,
            "away_team_id": game.away_team_id,
            "game_date": str(game.game_date),
            "home_score": game.home_score,
            "away_score": game.away_score,
            "status": game.status,
            "overtime": game.overtime,
        },
        "home_team_stats": home_stats,
        "away_team_stats": away_stats,
    }
    # Постоянное кэширование завершённых матчей
    ttl = 86400 * 365 if game.status == "Finished" else 300
    await cache.set(cache_key, data, ttl=ttl)
    return data


@router.get("/compare/players")
async def compare_players(
    p1_id: int,
    p2_id: int,
    season_id: int,
    cache: CacheManager = Depends(get_cache),
    db: AsyncSession = Depends(get_db),
):
    cache_key = f"compare:{min(p1_id,p2_id)}:{max(p1_id,p2_id)}:{season_id}"
    cached = await cache.get(cache_key)
    if cached:
        return cached

    async def get_player_season(pid: int):
        q = (
            select(
                Player.player_id,
                Player.nba_id,
                Player.first_name,
                Player.last_name,
                PlayerSeasonStats,
            )
            .join(PlayerSeasonStats, PlayerSeasonStats.player_id == Player.player_id)
            .where(Player.player_id == pid)
            .where(PlayerSeasonStats.season_id == season_id)
        )
        res = await db.execute(q)
        return res.first()

    r1 = await get_player_season(p1_id)
    r2 = await get_player_season(p2_id)

    if not r1 or not r2:
        raise HTTPException(status_code=404, detail="One or both players not found for this season")

    p1, pss1 = r1[0], r1[4]
    p2, pss2 = r2[0], r2[4]

    def stats_dict(player, pss):
        return {
            "pss_id": pss.pss_id,
            "player_id": pss.player_id,
            "season_id": pss.season_id,
            "team_id": pss.team_id,
            "games_played": pss.games_played,
            "avg_pts": str(pss.avg_pts) if pss.avg_pts else None,
            "avg_reb": str(pss.avg_reb) if pss.avg_reb else None,
            "avg_ast": str(pss.avg_ast) if pss.avg_ast else None,
            "per": str(pss.per) if pss.per else None,
            "ts_pct": str(pss.ts_pct) if pss.ts_pct else None,
            "efg_pct": str(pss.efg_pct) if pss.efg_pct else None,
            "bpm": str(pss.bpm) if pss.bpm else None,
            "usg_pct": str(pss.usg_pct) if pss.usg_pct else None,
        }

    data = {
        "player1": stats_dict(p1, pss1),
        "player2": stats_dict(p2, pss2),
        "player1_name": f"{p1.first_name} {p1.last_name}",
        "player2_name": f"{p2.first_name} {p2.last_name}",
        "player1_photo": f"https://cdn.nba.com/headshots/nba/latest/1040x760/{p1.nba_id}.png",
        "player2_photo": f"https://cdn.nba.com/headshots/nba/latest/1040x760/{p2.nba_id}.png",
    }
    await cache.set(cache_key, data, ttl=300)
    return data
