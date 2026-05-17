from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, ForeignKey, Numeric, SmallInteger
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.game import Game
    from app.models.player import Player
    from app.models.team import Team


class GamePlayerStats(Base):
    __tablename__ = "game_player_stats"

    stat_id: Mapped[int] = mapped_column(primary_key=True)
    game_id: Mapped[int] = mapped_column(ForeignKey("games.game_id", ondelete="CASCADE"), nullable=False)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.player_id"), nullable=False)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.team_id"), nullable=False)
    minutes_played: Mapped[Optional[Decimal]] = mapped_column(Numeric(4, 1))
    points: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    rebounds_off: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    rebounds_def: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    assists: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    steals: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    blocks: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    turnovers: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    fouls: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    fgm: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    fga: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    fg3m: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    fg3a: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    ftm: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    fta: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    plus_minus: Mapped[Optional[int]] = mapped_column(SmallInteger)
    is_starter: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    game: Mapped["Game"] = relationship(back_populates="player_stats")
    player: Mapped["Player"] = relationship(back_populates="game_stats")
    team: Mapped["Team"] = relationship(back_populates="game_stats")
