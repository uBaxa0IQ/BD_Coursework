import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Date, ForeignKey, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.season import Season
    from app.models.team import Team
    from app.models.game_player_stats import GamePlayerStats


class Game(Base):
    __tablename__ = "games"

    game_id: Mapped[int] = mapped_column(primary_key=True)
    season_id: Mapped[int] = mapped_column(ForeignKey("seasons.season_id"), nullable=False)
    home_team_id: Mapped[int] = mapped_column(ForeignKey("teams.team_id"), nullable=False)
    away_team_id: Mapped[int] = mapped_column(ForeignKey("teams.team_id"), nullable=False)
    game_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    home_score: Mapped[Optional[int]] = mapped_column(SmallInteger)
    away_score: Mapped[Optional[int]] = mapped_column(SmallInteger)
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="Scheduled")
    overtime: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)

    season: Mapped["Season"] = relationship(back_populates="games")
    home_team: Mapped["Team"] = relationship(
        back_populates="home_games",
        foreign_keys=[home_team_id],
    )
    away_team: Mapped["Team"] = relationship(
        back_populates="away_games",
        foreign_keys=[away_team_id],
    )
    player_stats: Mapped[List["GamePlayerStats"]] = relationship(
        back_populates="game",
        cascade="all, delete-orphan",
    )
