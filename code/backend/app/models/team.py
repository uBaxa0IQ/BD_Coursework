from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.game import Game
    from app.models.game_player_stats import GamePlayerStats
    from app.models.player_team_history import PlayerTeamHistory


class Team(Base):
    __tablename__ = "teams"

    team_id: Mapped[int] = mapped_column(primary_key=True)
    nba_team_id: Mapped[int] = mapped_column(unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(60), unique=True, nullable=False)
    abbreviation: Mapped[str] = mapped_column(String(3), unique=True, nullable=False)
    city: Mapped[str] = mapped_column(String(50), nullable=False)
    conference: Mapped[str] = mapped_column(String(4), nullable=False)
    arena_name: Mapped[Optional[str]] = mapped_column(String(80))
    founded_year: Mapped[Optional[int]] = mapped_column(SmallInteger)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    home_games: Mapped[List["Game"]] = relationship(
        back_populates="home_team",
        foreign_keys="Game.home_team_id",
    )
    away_games: Mapped[List["Game"]] = relationship(
        back_populates="away_team",
        foreign_keys="Game.away_team_id",
    )
    game_stats: Mapped[List["GamePlayerStats"]] = relationship(back_populates="team")
    player_history: Mapped[List["PlayerTeamHistory"]] = relationship(back_populates="team")
