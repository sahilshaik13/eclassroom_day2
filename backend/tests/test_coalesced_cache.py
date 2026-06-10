"""Tests for coalesced_get_or_set.

Covers:
  - 10 concurrent requests for the same missing key share 1 factory call
  - Cached hit is returned (factory is NOT called) when key is present
  - Factory exception is propagated to all waiters (and the in-flight
    map is cleaned up so the next request retries)
"""
import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.core import cache_service


@pytest.fixture
def mock_redis():
    """Mock get_redis to return None so cache_get/cache_set are no-ops."""
    with patch.object(cache_service, "get_redis", return_value=None):
        yield


@pytest.mark.asyncio
async def test_coalesces_concurrent_requests(mock_redis):
    """10 concurrent requests for the same key → exactly 1 factory call."""
    factory_call_count = 0
    factory_started = asyncio.Event()
    factory_release = asyncio.Event()

    async def slow_factory():
        nonlocal factory_call_count
        factory_call_count += 1
        factory_started.set()
        await factory_release.wait()
        return {"value": 42}

    tasks = [
        asyncio.create_task(
            cache_service.coalesced_get_or_set("test:key", 60, slow_factory)
        )
        for _ in range(10)
    ]

    # Wait until the factory is actually invoked
    await asyncio.wait_for(factory_started.wait(), timeout=1.0)

    # Release the factory
    factory_release.set()

    results = await asyncio.gather(*tasks)

    # All 10 should get the same value
    assert all(r == ({"value": 42}, False) for r in results)
    # But factory was called exactly once
    assert factory_call_count == 1


@pytest.mark.asyncio
async def test_returns_cached_value_without_calling_factory(mock_redis):
    """If cache_get returns a value, factory is never called."""
    cached = {"cached": True}

    with patch.object(cache_service, "cache_get", return_value=cached):
        factory = AsyncMock(return_value={"should": "not run"})
        result, hit = await cache_service.coalesced_get_or_set("test:key", 60, factory)
        assert result == cached
        assert hit is True
        factory.assert_not_called()


@pytest.mark.asyncio
async def test_propagates_exception_and_cleans_up(mock_redis):
    """If the factory throws, all waiters see the exception, and a
    subsequent request gets a fresh attempt (not a poisoned cache)."""
    call_count = 0

    async def failing_factory():
        nonlocal call_count
        call_count += 1
        raise ValueError("boom")

    # First request fails
    with pytest.raises(ValueError, match="boom"):
        await cache_service.coalesced_get_or_set("test:key", 60, failing_factory)
    assert call_count == 1

    # In-flight map should be cleaned up so the next request retries
    assert "test:key" not in cache_service._in_flight

    # Second request also fails (fresh attempt, not poisoned)
    with pytest.raises(ValueError, match="boom"):
        await cache_service.coalesced_get_or_set("test:key", 60, failing_factory)
    assert call_count == 2


@pytest.mark.asyncio
async def test_concurrent_failure_all_waiters_get_exception(mock_redis):
    """If 5 concurrent requests share a factory that throws, all 5
    should receive the exception (not hang waiting on the future)."""
    factory_started = asyncio.Event()
    factory_release = asyncio.Event()

    async def failing_factory():
        factory_started.set()
        await factory_release.wait()
        raise RuntimeError("factory failed")

    tasks = [
        asyncio.create_task(
            cache_service.coalesced_get_or_set("test:key", 60, failing_factory)
        )
        for _ in range(5)
    ]

    await asyncio.wait_for(factory_started.wait(), timeout=1.0)
    factory_release.set()

    results = await asyncio.gather(*tasks, return_exceptions=True)
    assert all(isinstance(r, RuntimeError) for r in results)
    assert "test:key" not in cache_service._in_flight
