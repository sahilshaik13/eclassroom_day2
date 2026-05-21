"""Run blocking Supabase/PostgREST calls without blocking the event loop."""
from __future__ import annotations

import asyncio
from typing import Callable, TypeVar

T = TypeVar("T")


async def run_sync(fn: Callable[[], T]) -> T:
    return await asyncio.to_thread(fn)


async def gather_sync(*fns: Callable[[], T]) -> tuple[T, ...]:
    return await asyncio.gather(*(run_sync(f) for f in fns))
