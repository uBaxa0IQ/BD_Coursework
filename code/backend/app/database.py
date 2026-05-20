from typing import AsyncGenerator, Literal, Optional

from fastapi import Header
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

DbRole = Literal["analyst", "reader", "admin"]


def _make_engine(url: str):
    return create_async_engine(
        url,
        echo=settings.ENVIRONMENT == "development",
        pool_size=20,
        max_overflow=40,
        pool_pre_ping=True,
    )


engine_analyst = _make_engine(settings.DATABASE_URL)
engine_reader = _make_engine(settings.DATABASE_URL_READER)
engine_admin = _make_engine(settings.DATABASE_URL_ADMIN)

# Обратная совместимость (health, старые импорты)
engine = engine_analyst

SessionAnalyst = async_sessionmaker(
    bind=engine_analyst,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)
SessionReader = async_sessionmaker(
    bind=engine_reader,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)
SessionAdmin = async_sessionmaker(
    bind=engine_admin,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)

AsyncSessionLocal = SessionAnalyst

_ROLE_SESSIONS = {
    "analyst": SessionAnalyst,
    "reader": SessionReader,
    "admin": SessionAdmin,
}


class Base(DeclarativeBase):
    pass


def _normalize_db_role(raw: Optional[str]) -> DbRole:
    if not raw:
        return "analyst"
    role = raw.strip().lower()
    if role in ("analyst", "reader", "admin", "db_admin"):
        return "admin" if role == "db_admin" else role  # type: ignore[return-value]
    return "analyst"


async def _session_for_role(role: DbRole) -> AsyncGenerator[AsyncSession, None]:
    factory = _ROLE_SESSIONS[role]
    async with factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def get_db_reader() -> AsyncGenerator[AsyncSession, None]:
    """Сессия reader: только SELECT на представления (v_team_standings и др.)."""
    async for session in _session_for_role("reader"):
        yield session


async def get_db_analyst() -> AsyncGenerator[AsyncSession, None]:
    """Сессия analyst: SELECT на таблицы и расчётные функции."""
    async for session in _session_for_role("analyst"):
        yield session


async def get_db_admin() -> AsyncGenerator[AsyncSession, None]:
    """Сессия db_admin: процедуры update_season_stats, DDL."""
    async for session in _session_for_role("admin"):
        yield session


async def get_db(
    x_db_role: Optional[str] = Header(None, alias="X-DB-Role"),
) -> AsyncGenerator[AsyncSession, None]:
    """Сессия по заголовку X-DB-Role (для тестов и исследований; по умолчанию analyst)."""
    async for session in _session_for_role(_normalize_db_role(x_db_role)):
        yield session
