import json
import logging
from typing import Any, Optional

import redis.asyncio as aioredis

from app.config import settings

logger = logging.getLogger(__name__)

redis_client: Optional[aioredis.Redis] = None


async def get_redis() -> aioredis.Redis:
    global redis_client
    if redis_client is None:
        redis_client = aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
        )
    return redis_client


class CacheManager:
    def __init__(self, client: aioredis.Redis):
        self._client = client

    async def get(self, key: str) -> Optional[Any]:
        try:
            value = await self._client.get(key)
            if value is None:
                return None
            return json.loads(value)
        except Exception as exc:
            logger.warning("Redis GET failed for key=%s: %s", key, exc)
            return None

    async def set(self, key: str, value: Any, ttl: int = 300) -> bool:
        try:
            serialized = json.dumps(value, default=str)
            if ttl > 0:
                await self._client.setex(key, ttl, serialized)
            else:
                await self._client.set(key, serialized)
            return True
        except Exception as exc:
            logger.warning("Redis SET failed for key=%s: %s", key, exc)
            return False

    async def delete(self, key: str) -> bool:
        try:
            await self._client.delete(key)
            return True
        except Exception as exc:
            logger.warning("Redis DELETE failed for key=%s: %s", key, exc)
            return False

    async def delete_pattern(self, pattern: str) -> int:
        try:
            keys = await self._client.keys(pattern)
            if keys:
                return await self._client.delete(*keys)
            return 0
        except Exception as exc:
            logger.warning("Redis DELETE PATTERN failed for pattern=%s: %s", pattern, exc)
            return 0

    async def exists(self, key: str) -> bool:
        try:
            return bool(await self._client.exists(key))
        except Exception as exc:
            logger.warning("Redis EXISTS failed for key=%s: %s", key, exc)
            return False


async def get_cache() -> CacheManager:
    client = await get_redis()
    return CacheManager(client)
