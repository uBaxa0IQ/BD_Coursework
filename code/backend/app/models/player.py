import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, Date, ForeignKey, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.position import Position
    from app.models.game_player_stats import GamePlayerStats
    from app.models.player_season_stats import PlayerSeasonStats
    from app.models.player_team_history import PlayerTeamHistory


class Player(Base):
    __tablename__ = "players"

    player_id: Mapped[int] = mapped_column(primary_key=True)
    nba_id: Mapped[int] = mapped_column(unique=True, nullable=False)
    first_name: Mapped[str] = mapped_column(String(50), nullable=False)
    last_name: Mapped[str] = mapped_column(String(50), nullable=False)
    birth_date: Mapped[Optional[datetime.date]] = mapped_column(Date)
    nationality: Mapped[Optional[str]] = mapped_column(String(50))
    height_cm: Mapped[Optional[int]] = mapped_column(SmallInteger)
    weight_kg: Mapped[Optional[int]] = mapped_column(SmallInteger)
    position_id: Mapped[Optional[int]] = mapped_column(ForeignKey("positions.position_id"))
    jersey_number: Mapped[Optional[int]] = mapped_column(SmallInteger)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    draft_year: Mapped[Optional[int]] = mapped_column(SmallInteger)
    draft_round: Mapped[Optional[int]] = mapped_column(SmallInteger)
    draft_pick: Mapped[Optional[int]] = mapped_column(SmallInteger)

    position: Mapped[Optional["Position"]] = relationship(back_populates="players")
    game_stats: Mapped[List["GamePlayerStats"]] = relationship(back_populates="player")
    season_stats: Mapped[List["PlayerSeasonStats"]] = relationship(back_populates="player")
    team_history: Mapped[List["PlayerTeamHistory"]] = relationship(back_populates="player")
