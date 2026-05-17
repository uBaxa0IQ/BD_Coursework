from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel


class GamePlayerStatsResponse(BaseModel):
    stat_id: int
    game_id: int
    player_id: int
    team_id: int
    player_name: Optional[str] = None
    minutes_played: Optional[Decimal] = None
    points: int = 0
    rebounds_off: int = 0
    rebounds_def: int = 0
    assists: int = 0
    steals: int = 0
    blocks: int = 0
    turnovers: int = 0
    fouls: int = 0
    fgm: int = 0
    fga: int = 0
    fg3m: int = 0
    fg3a: int = 0
    ftm: int = 0
    fta: int = 0
    plus_minus: Optional[int] = None
    is_starter: bool = False

    model_config = {"from_attributes": True}

    @property
    def rebounds(self) -> int:
        return self.rebounds_off + self.rebounds_def


class PlayerSeasonStatsResponse(BaseModel):
    pss_id: int
    player_id: int
    season_id: int
    team_id: int
    games_played: int = 0
    avg_pts: Optional[Decimal] = None
    avg_reb: Optional[Decimal] = None
    avg_ast: Optional[Decimal] = None
    avg_stl: Optional[Decimal] = None
    avg_blk: Optional[Decimal] = None
    avg_tov: Optional[Decimal] = None
    avg_min: Optional[Decimal] = None
    fg_pct: Optional[Decimal] = None
    fg3_pct: Optional[Decimal] = None
    ft_pct: Optional[Decimal] = None
    avg_plus_minus: Optional[Decimal] = None
    efg_pct: Optional[Decimal] = None
    ts_pct: Optional[Decimal] = None
    usg_pct: Optional[Decimal] = None
    per: Optional[Decimal] = None
    bpm: Optional[Decimal] = None

    model_config = {"from_attributes": True}


class LeaderboardEntry(BaseModel):
    rank: int
    player_id: int
    player_name: str
    team_name: str
    team_abbreviation: str
    nba_id: int
    position: Optional[str] = None
    games_played: int
    value: Optional[Decimal] = None
    metric: str

    model_config = {"from_attributes": True}

    @property
    def photo_url(self) -> str:
        return f"https://cdn.nba.com/headshots/nba/latest/1040x760/{self.nba_id}.png"


class ComparePlayersResponse(BaseModel):
    player1: PlayerSeasonStatsResponse
    player2: PlayerSeasonStatsResponse
    player1_name: str
    player2_name: str
    player1_photo: str
    player2_photo: str
    better_player: Optional[dict] = None

    model_config = {"from_attributes": True}
