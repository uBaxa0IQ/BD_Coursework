import datetime
from typing import TYPE_CHECKING, List

from sqlalchemy import Date, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.game import Game


class Season(Base):
    __tablename__ = "seasons"

    season_id: Mapped[int] = mapped_column(primary_key=True)
    label: Mapped[str] = mapped_column(String(9), unique=True, nullable=False)
    start_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    end_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    season_type: Mapped[str] = mapped_column(String(15), nullable=False, default="Regular")

    games: Mapped[List["Game"]] = relationship(back_populates="season")
