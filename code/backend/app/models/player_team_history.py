import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Date, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.player import Player
    from app.models.team import Team
    from app.models.season import Season


class PlayerTeamHistory(Base):
    __tablename__ = "player_team_history"
    __table_args__ = (
        UniqueConstraint("player_id", "season_id", "team_id", name="uq_player_team_season"),
    )

    history_id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.player_id"), nullable=False)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.team_id"), nullable=False)
    season_id: Mapped[int] = mapped_column(ForeignKey("seasons.season_id"), nullable=False)
    start_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    end_date: Mapped[Optional[datetime.date]] = mapped_column(Date)
    contract_type: Mapped[str] = mapped_column(String(20), nullable=False, default="Standard")

    player: Mapped["Player"] = relationship(back_populates="team_history")
    team: Mapped["Team"] = relationship(back_populates="player_history")
    season: Mapped["Season"] = relationship()
