from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import Numeric, func, select, text
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
from app.utils.sanitize import sanitize_rows

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
        }
        for t in teams
    ]
    await cache.set(cache_key, data, ttl=900)
    return data


@router.get("/standings")
async def get_standings(
    season_id: int,
    cache: CacheManager = Depends(get_cache),
    db: AsyncSession = Depends(get_db_analyst),
):
    cache_key = f"standings:v2:{season_id}"
    cached = await cache.get(cache_key)
    if cached:
        return cached

    result = await db.execute(
        text("""
            SELECT team_id, name, abbreviation, city, conference,
                   nba_team_id, season_id, season, wins, losses, games_played, win_pct
            FROM v_team_standings
            WHERE season_id = :season_id
            ORDER BY win_pct DESC NULLS LAST
        """),
        {"season_id": season_id},
    )
    standings: Dict[str, list] = {"East": [], "West": []}
    for row in sanitize_rows(result.mappings().all()):
        conf = row.get("conference", "East")
        if conf in standings:
            standings[conf].append(row)

    await cache.set(cache_key, standings, ttl=900)
    return standings


@router.get("/stats")
async def get_teams_avg_stats(
    season_id: int,
    limit: int = 10,
    order_by: str = "avg_pts",
    cache: CacheManager = Depends(get_cache),
    db: AsyncSession = Depends(get_db_analyst),
):
    if order_by != "avg_pts":
        raise HTTPException(status_code=422, detail="Only order_by=avg_pts is supported")

    cache_key = f"teams_avg_stats:v2:{season_id}:{limit}:{order_by}"
    cached = await cache.get(cache_key)
    if cached:
        return cached

    # avg_pts — очки КОМАНДЫ за игру (сумма очков игроков в матче, усреднённая по матчам),
    # берётся из представления v_team_stats. Раньше ошибочно усреднялись средние очки
    # игроков ростера, из-за чего значения выходили ~8–10 вместо ~110–120.
    result = await db.execute(
        text(
            """
            SELECT abbreviation AS team_abbreviation, avg_pts
            FROM v_team_stats
            WHERE season_id = :season_id
            ORDER BY avg_pts DESC NULLS LAST
            LIMIT :limit
            """
        ),
        {"season_id": season_id, "limit": limit},
    )
    data = sanitize_rows(result.mappings().all())
    await cache.set(cache_key, data, ttl=900)
    return data


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
    cache_key = f"team_roster:v3:{team_id}:{season_id}"
    cached = await cache.get(cache_key)
    if cached:
        return cached

    # is_current:          ПОСЛЕДНИЙ матч сезона сыгран за эту команду
    #                      (обменянный по ходу сезона останется в агрегате,
    #                       но last_team_id будет другим → is_current = FALSE);
    # arrived_mid_season:  ПЕРВЫЙ матч сезона сыгран за ДРУГУЮ команду
    #                      (игрок пришёл в команду по ходу сезона).
    result = await db.execute(
        text(
            """
            WITH last_team AS (
                SELECT DISTINCT ON (gps.player_id)
                       gps.player_id, gps.team_id AS last_team_id
                FROM game_player_stats gps
                JOIN games g ON g.game_id = gps.game_id
                WHERE g.season_id = :season_id
                ORDER BY gps.player_id, g.game_date DESC, g.game_id DESC
            ),
            first_team AS (
                SELECT DISTINCT ON (gps.player_id)
                       gps.player_id, gps.team_id AS first_team_id
                FROM game_player_stats gps
                JOIN games g ON g.game_id = gps.game_id
                WHERE g.season_id = :season_id
                ORDER BY gps.player_id, g.game_date ASC, g.game_id ASC
            )
            SELECT p.player_id, p.nba_id, p.first_name, p.last_name,
                   pos.code AS position, p.jersey_number,
                   pss.games_played, pss.avg_pts, pss.avg_reb, pss.avg_ast, pss.per,
                   COALESCE(lt.last_team_id = :team_id, TRUE)  AS is_current,
                   COALESCE(ft.first_team_id <> :team_id, FALSE) AS arrived_mid_season
            FROM player_season_stats pss
            JOIN players p ON p.player_id = pss.player_id
            LEFT JOIN positions pos ON pos.position_id = p.position_id
            LEFT JOIN last_team lt ON lt.player_id = pss.player_id
            LEFT JOIN first_team ft ON ft.player_id = pss.player_id
            WHERE pss.team_id = :team_id AND pss.season_id = :season_id
            ORDER BY pss.avg_pts DESC NULLS LAST
            """
        ),
        {"team_id": team_id, "season_id": season_id},
    )
    data = sanitize_rows(result.mappings().all())
    await cache.set(cache_key, data, ttl=300)
    return data


@router.get("/{team_id}/summary")
async def get_team_summary(
    team_id: int,
    season_id: int,
    cache: CacheManager = Depends(get_cache),
    db: AsyncSession = Depends(get_db_analyst),
):
    """Сводка команды за сезон: турнирные показатели (W/L/W%, место в конференции
    из v_team_standings) + расчётная командная статистика за матч
    (PTS/REB/AST/TOV, eFG%, TS% из v_team_stats). Реализует ФТ «расчёт командной
    статистики в рамках матча и сезона»."""
    cache_key = f"team_summary:{team_id}:{season_id}"
    cached = await cache.get(cache_key)
    if cached:
        return cached

    # Турнирная таблица всего сезона — нужна для вычисления места команды
    st_rows = sanitize_rows(
        (
            await db.execute(
                text(
                    """
                    SELECT team_id, name, abbreviation, conference, nba_team_id,
                           season_id, season, wins, losses, games_played, win_pct
                    FROM v_team_standings
                    WHERE season_id = :season_id
                    ORDER BY win_pct DESC NULLS LAST
                    """
                ),
                {"season_id": season_id},
            )
        ).mappings().all()
    )

    standing = next((r for r in st_rows if r["team_id"] == team_id), None)
    if not standing:
        raise HTTPException(status_code=404, detail="Team standing not found for this season")

    conference = standing.get("conference")
    conf_rows = [r for r in st_rows if r.get("conference") == conference]
    conf_rank = next((i + 1 for i, r in enumerate(conf_rows) if r["team_id"] == team_id), None)

    # Командная статистика за матч (агрегат из game_player_stats через v_team_stats)
    stats_row = sanitize_rows(
        (
            await db.execute(
                text(
                    """
                    SELECT avg_pts, avg_reb, avg_ast, avg_tov, efg_pct, ts_pct
                    FROM v_team_stats
                    WHERE season_id = :season_id AND team_id = :team_id
                    """
                ),
                {"season_id": season_id, "team_id": team_id},
            )
        ).mappings().all()
    )
    stats = stats_row[0] if stats_row else {}

    # Лиговый ранг по очкам за матч (для подписи «N-я атака лиги»)
    pts_order = sanitize_rows(
        (
            await db.execute(
                text(
                    """
                    SELECT team_id
                    FROM v_team_stats
                    WHERE season_id = :season_id
                    ORDER BY avg_pts DESC NULLS LAST
                    """
                ),
                {"season_id": season_id},
            )
        ).mappings().all()
    )
    pts_rank = next((i + 1 for i, r in enumerate(pts_order) if r["team_id"] == team_id), None)

    data = {
        "team_id": team_id,
        "season_id": season_id,
        "season": standing.get("season"),
        "conference": conference,
        "conf_rank": conf_rank,
        "conf_teams": len(conf_rows),
        "league_teams": len(pts_order),
        "wins": standing.get("wins"),
        "losses": standing.get("losses"),
        "games_played": standing.get("games_played"),
        "win_pct": standing.get("win_pct"),
        "avg_pts": stats.get("avg_pts"),
        "avg_reb": stats.get("avg_reb"),
        "avg_ast": stats.get("avg_ast"),
        "avg_tov": stats.get("avg_tov"),
        "efg_pct": stats.get("efg_pct"),
        "ts_pct": stats.get("ts_pct"),
        "pts_rank": pts_rank,
    }
    await cache.set(cache_key, data, ttl=900)
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
