"""One-off patch: add request coalescing to backend/app/core/cache_service.py."""
from pathlib import Path

p = Path(r"F:\eclassroom_day2\backend\app\core\cache_service.py")
c = p.read_text(encoding="utf-8")

# 1) Ensure _in_flight dict is declared after the T = TypeVar line
old2 = 'T = TypeVar("T")\n\n# Cache metrics for performance monitoring'
new2 = '''T = TypeVar("T")

# In-flight factory tasks keyed by cache key. Concurrent requests for the
# same missing key share one factory invocation (request coalescing) instead
# of all hitting the DB / Supabase in parallel. Especially valuable for the
# study-plan endpoint where 20 students opening the same class within ~200ms
# would otherwise fan out 20 identical queries.
_in_flight: dict[str, asyncio.Future] = {}

# Cache metrics for performance monitoring'''
assert old2 in c, "marker #2 not found"
c = c.replace(old2, new2, 1)

# 2) Add coalesced_get_or_set + cache_set_sync helpers right after get_or_set_cache
old3 = '''async def get_or_set_cache(
    key: str,
    ttl_seconds: int,
    factory: Callable[[], Awaitable[T]],
) -> tuple[T, bool]:
    """Return (value, cache_hit). Skips Redis if unavailable."""
    cached = await cache_get(key)
    if cached is not None:
        return cached, True
    value = await factory()
    await cache_set(key, value, ttl_seconds)
    return value, False'''

new3 = '''async def get_or_set_cache(
    key: str,
    ttl_seconds: int,
    factory: Callable[[], Awaitable[T]],
) -> tuple[T, bool]:
    """Return (value, cache_hit). Skips Redis if unavailable."""
    cached = await cache_get(key)
    if cached is not None:
        return cached, True
    value = await factory()
    await cache_set(key, value, ttl_seconds)
    return value, False


async def coalesced_get_or_set(
    key: str,
    ttl_seconds: int,
    factory: Callable[[], Awaitable[T]],
) -> tuple[T, bool]:
    """
    Same as get_or_set_cache but with request coalescing: when N coroutines
    ask for the same missing key at the same time, only one factory runs and
    the rest await the same Future. Eliminates thundering-herd on hot keys
    like the per-class study plan when 20 students open the same class.
    """
    cached = await cache_get(key)
    if cached is not None:
        return cached, True

    existing = _in_flight.get(key)
    if existing is not None and not existing.done():
        value = await existing
        return value, False

    loop = asyncio.get_running_loop()
    fut: asyncio.Future = loop.create_future()

    async def _runner() -> T:
        try:
            value = await factory()
            # Schedule the cache write without blocking the hot path.
            try:
                loop.create_task(cache_set(key, value, ttl_seconds))
            except RuntimeError:
                await cache_set(key, value, ttl_seconds)
            if not fut.done():
                fut.set_result(value)
            return value
        except Exception as exc:
            if not fut.done():
                fut.set_exception(exc)
            raise
        finally:
            _in_flight.pop(key, None)

    _in_flight[key] = fut
    await _runner()
    value = await fut
    return value, False'''

assert old3 in c, "marker #3 not found"
c = c.replace(old3, new3, 1)

p.write_text(c, encoding="utf-8", newline="")
print("patched:", p)
print("len:", len(c))
