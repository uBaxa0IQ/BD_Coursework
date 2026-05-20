from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, computed_field


class TeamResponse(BaseModel):
    team_id: int
    nba_team_id: int
    name: str
    abbreviation: str
    city: str
    conference: str

    model_config = {"from_attributes": True}

    @computed_field
    @property
    def logo_url(self) -> str:
        return f"https://cdn.nba.com/logos/nba/{self.nba_team_id}/global/L/logo.svg"


class TeamDetailResponse(BaseModel):
    team_id: int
    nba_team_id: int
    name: str
    abbreviation: str
    city: str
    conference: str
    arena_name: Optional[str] = None
    founded_year: Optional[int] = None
    is_active: bool = True

    model_config = {"from_attributes": True}

    @computed_field
    @property
    def logo_url(self) -> str:
        return f"https://cdn.nba.com/logos/nba/{self.nba_team_id}/global/L/logo.svg"


class StandingsResponse(BaseModel):
    team_id: int
    nba_team_id: int
    name: str
    abbreviation: str
    city: str
    conference: str
    season_id: int
    season: str
    wins: int
    losses: int
    games_played: int
    win_pct: Optional[Decimal] = None

    model_config = {"from_attributes": True}

    @computed_field
    @property
    def logo_url(self) -> str:
        return f"https://cdn.nba.com/logos/nba/{self.nba_team_id}/global/L/logo.svg"
