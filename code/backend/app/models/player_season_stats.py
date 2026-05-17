from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import ForeignKey, Numeric, SmallInteger
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.player import Player
    from app.models.season import Season
    from app.models.team import Team


class PlayerSeasonStats(Base):
    __tablename__ = "player_season_stats"

    pss_id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.player_id"), nullable=False)
    season_id: Mapped[int] = mapped_column(ForeignKey("seasons.season_id"), nullable=False)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.team_id"), nullable=False)
    games_played: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    avg_pts: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2))
    avg_reb: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2))
    avg_ast: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2))
    avg_stl: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2))
    avg_blk: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2))
    avg_tov: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2))
    avg_min: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2))
    fg_pct: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 4))
    fg3_pct: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 4))
    ft_pct: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 4))
    avg_plus_minus: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2))
    efg_pct: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 4))
    ts_pct: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 4))
    usg_pct: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 4))
    per: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 2))
    bpm: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2))

    player: Mapped["Player"] = relationship(back_populates="season_stats")
    season: Mapped["Season"] = relationship()
    team: Mapped["Team"] = relationship()
