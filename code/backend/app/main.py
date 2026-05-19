import logging

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache import CacheManager, get_cache, get_redis
from app.database import get_db_analyst
from app.routers import players, teams, stats, league, admin

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="NBA Statistics API",
    description="API для статистики игроков и команд NBA (2019-20 → 2023-24)",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://frontend:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(players.router, prefix="/players",  tags=["Players"])
app.include_router(teams.router,   prefix="/teams",    tags=["Teams"])
app.include_router(stats.router,   prefix="/stats",    tags=["Stats"])
app.include_router(league.router,  prefix="/league",   tags=["League"])
app.include_router(admin.router,   prefix="/admin",    tags=["Admin"])


@app.get("/", tags=["Health"])
async def root():
    return {"status": "ok", "service": "NBA Stats API", "version": "1.0.0"}


@app.get("/health", tags=["Health"])
async def health_check(
    db: AsyncSession = Depends(get_db_analyst),
    cache: CacheManager = Depends(get_cache),
):
    db_ok = False
    redis_ok = False

    try:
        await db.execute(text("SELECT 1"))
        db_ok = True
    except Exception as e:
        logger.error("DB health check failed: %s", e)

    try:
        client = await get_redis()
        await client.ping()
        redis_ok = True
    except Exception as e:
        logger.error("Redis health check failed: %s", e)

    return {
        "status": "ok" if (db_ok and redis_ok) else "degraded",
        "postgresql": "healthy" if db_ok else "unhealthy",
        "redis": "healthy" if redis_ok else "unhealthy",
    }
