from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, computed_field


class PlayerBase(BaseModel):
    player_id: int
    nba_id: int
    first_name: str
    last_name: str

    model_config = {"from_attributes": True}

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"


class PlayerResponse(BaseModel):
    player_id: int
    nba_id: int
    first_name: str
    last_name: str
    team_name: Optional[str] = None
    team_abbreviation: Optional[str] = None
    position: Optional[str] = None
    games_played: Optional[int] = None
    avg_pts: Optional[Decimal] = None
    avg_reb: Optional[Decimal] = None
    avg_ast: Optional[Decimal] = None
    per: Optional[Decimal] = None
    ts_pct: Optional[Decimal] = None

    model_config = {"from_attributes": True}

    @computed_field
    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"

    @computed_field
    @property
    def photo_url(self) -> str:
        return f"https://cdn.nba.com/headshots/nba/latest/1040x760/{self.nba_id}.png"


class PlayerDetailResponse(BaseModel):
    player_id: int
    nba_id: int
    first_name: str
    last_name: str
    birth_date: Optional[str] = None
    nationality: Optional[str] = None
    height_cm: Optional[int] = None
    weight_kg: Optional[int] = None
    position: Optional[str] = None
    jersey_number: Optional[int] = None
    is_active: bool = True
    draft_year: Optional[int] = None
    draft_round: Optional[int] = None
    draft_pick: Optional[int] = None
    team_name: Optional[str] = None
    team_abbreviation: Optional[str] = None
    nba_team_id: Optional[int] = None

    model_config = {"from_attributes": True}

    @computed_field
    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"

    @computed_field
    @property
    def photo_url(self) -> str:
        return f"https://cdn.nba.com/headshots/nba/latest/1040x760/{self.nba_id}.png"

    @computed_field
    @property
    def logo_url(self) -> Optional[str]:
        if self.nba_team_id:
            return f"https://cdn.nba.com/logos/nba/{self.nba_team_id}/global/L/logo.svg"
        return None


class PlayerStatsResponse(BaseModel):
    season_label: str
    season_id: int
    games_played: int
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


class PlayerCareerResponse(BaseModel):
    player_id: int
    full_name: str
    photo_url: str
    seasons: List[PlayerStatsResponse]

    model_config = {"from_attributes": True}
