import time
from typing import Any, Optional
from cachetools import TTLCache

_cache: TTLCache = TTLCache(maxsize=2000, ttl=86400)


def cache_get(key: str) -> Optional[Any]:
    entry = _cache.get(key)
    if entry is None:
        return None
    if entry["exp"] and time.time() > entry["exp"]:
        _cache.pop(key, None)
        return None
    return entry["v"]


def cache_set(key: str, value: Any, ttl: int = 3600) -> None:
    _cache[key] = {"v": value, "exp": time.time() + ttl}


def cache_delete(key: str) -> None:
    _cache.pop(key, None)
