import os
from typing import AsyncGenerator

import asyncpg
import pytest_asyncio
import redis.asyncio as aioredis
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.main import app
from app.database import get_db, get_db_admin, get_db_analyst, get_db_reader
from app import cache as cache_module
from app.config import settings

TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://nba_admin:nba_secure_pass_2024@localhost:5432/nba_stats",
)
TEST_PG_URL = TEST_DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")


@pytest_asyncio.fixture
async def pg_conn():
    conn = await asyncpg.connect(TEST_PG_URL)
    yield conn
    await conn.close()


@pytest_asyncio.fixture
async def test_engine():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture(autouse=True)
async def redis_connection(monkeypatch):
    """Keep real Redis connections on the same event loop as each test."""
    connection = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    monkeypatch.setattr(cache_module, "redis_client", connection)
    try:
        yield connection
    finally:
        await connection.aclose()


@pytest_asyncio.fixture
async def db_session(test_engine) -> AsyncGenerator[AsyncSession, None]:
    session_factory = async_sessionmaker(bind=test_engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_db_analyst] = override_get_db
    app.dependency_overrides[get_db_reader] = override_get_db
    app.dependency_overrides[get_db_admin] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            yield c
    finally:
        app.dependency_overrides.clear()
