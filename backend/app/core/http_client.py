"""
Shared async HTTP client with connection pooling for better concurrency.

Usage:
    from app.core.http_client import get_http_client
    
    client = get_http_client()
    response = await client.get("https://api.example.com/data")
"""
from __future__ import annotations

import logging
from typing import Optional

import httpx
from functools import lru_cache

from app.core.config import settings

_logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_http_client() -> httpx.AsyncClient:
    """
    Get shared async HTTP client with connection pooling.
    
    The client is cached to reuse connections across requests,
    which significantly improves performance under load.
    """
    limits = httpx.Limits(
        max_connections=settings.HTTP_POOL_LIMIT,
        max_keepalive_connections=settings.HTTP_POOL_LIMIT_PER_HOST,
        keepalive_expiry=30.0,  # Keep connections alive for 30 seconds
    )
    
    # Timeouts: connect timeout shorter than read timeout
    timeout = httpx.Timeout(
        connect=5.0,      # Time to establish connection
        read=60.0,        # Time to read response
        write=10.0,       # Time to write request
        pool=5.0,         # Time to get connection from pool
    )
    
    client = httpx.AsyncClient(
        limits=limits,
        timeout=timeout,
        http2=True,  # Enable HTTP/2 for multiplexing
    )
    
    _logger.info(
        "HTTP client initialized with pool_limit=%s, per_host=%s, http2=%s",
        settings.HTTP_POOL_LIMIT,
        settings.HTTP_POOL_LIMIT_PER_HOST,
        True,
    )
    
    return client


async def close_http_client() -> None:
    """Close the shared HTTP client. Call this during shutdown."""
    client = get_http_client()
    try:
        await client.aclose()
        _logger.info("HTTP client closed")
    except Exception as exc:
        _logger.warning("Error closing HTTP client: %s", exc)
    finally:
        # Clear the cache so a new client can be created if needed
        get_http_client.cache_clear()
