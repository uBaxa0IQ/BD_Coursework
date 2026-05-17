import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel

from app.schemas.stats import GamePlayerStatsResponse


class GameResponse(BaseModel):
    game_id: int
    season_id: int
    home_team_id: int
    away_team_id: int
    home_team_name: Optional[str] = None
    away_team_name: Optional[str] = None
    home_team_abbreviation: Optional[str] = None
    away_team_abbreviation: Optional[str] = None
    game_date: datetime.date
    home_score: Optional[int] = None
    away_score: Optional[int] = None
    status: str
    overtime: int = 0

    model_config = {"from_attributes": True}


class BoxScoreResponse(BaseModel):
    game: GameResponse
    home_team_stats: List[GamePlayerStatsResponse]
    away_team_stats: List[GamePlayerStatsResponse]

    model_config = {"from_attributes": True}
