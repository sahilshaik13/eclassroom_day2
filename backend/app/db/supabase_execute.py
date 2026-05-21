"""Retry wrapper for transient Supabase PostgREST / httpx transport errors."""
from __future__ import annotations

import logging
import time
from typing import Any, Optional

import httpx

try:
    from postgrest.exceptions import APIError as PostgrestAPIError
except ImportError:  # pragma: no cover
    PostgrestAPIError = Exception  # type: ignore[misc, assignment]

_logger = logging.getLogger(__name__)


def first_row_from_response(res: Any) -> Optional[dict]:
    """First row from a PostgREST response (.limit(1) or list)."""
    if not res:
        return None
    data = getattr(res, "data", None)
    if isinstance(data, list):
        return data[0] if data else None
    if isinstance(data, dict):
        return data
    return None

RETRIABLE_HTTP_ERRORS = (
    httpx.RemoteProtocolError,
    httpx.ReadTimeout,
    httpx.ReadError,
    httpx.ConnectError,
)


def execute_with_retry(query_builder: Any, *, label: str, attempts: int = 3) -> Any:
    delay_seconds = 0.2
    for attempt in range(1, attempts + 1):
        try:
            return query_builder.execute()
        except PostgrestAPIError as exc:
            code = getattr(exc, "code", None) or ""
            if str(code) == "204":
                class _Empty:
                    data = None

                return _Empty()
            raise
        except RETRIABLE_HTTP_ERRORS as exc:
            if attempt >= attempts:
                raise
            _logger.warning(
                "Supabase transient transport error on %s (attempt %s/%s): %s",
                label,
                attempt,
                attempts,
                exc,
            )
            time.sleep(delay_seconds * attempt)
