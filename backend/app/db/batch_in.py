"""Batched PostgREST queries — avoid N+1 when filtering large id lists."""
from __future__ import annotations

from typing import Any, Callable, List, TypeVar

from app.db.supabase_execute import execute_with_retry

T = TypeVar("T")


def chunked_in_fetch(
    admin: Any,
    table: str,
    select: str,
    in_column: str,
    ids: List[str],
    *,
    extra_eq: Callable[[Any], Any] | None = None,
    chunk_size: int = 100,
    label: str = "chunked_in_fetch",
) -> List[dict]:
    """Run `.in_(column, chunk)` queries and merge rows (default chunk 100)."""
    if not ids:
        return []
    unique = list(dict.fromkeys(str(i) for i in ids if i))
    rows: List[dict] = []
    for i in range(0, len(unique), chunk_size):
        chunk = unique[i : i + chunk_size]
        q = admin.table(table).select(select).in_(in_column, chunk)
        if extra_eq:
            q = extra_eq(q)
        res = execute_with_retry(q, label=f"{label}:{i // chunk_size}")
        rows.extend(res.data or [])
    return rows
