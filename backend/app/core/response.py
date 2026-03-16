"""
Standard API response envelope used by every route.

Success:  { success: true,  data: T,              timestamp, requestId }
Paginated:{ success: true,  data: [...],  meta: {}, timestamp, requestId }
Error:    { success: false, error: {...},           timestamp, requestId }
"""
import uuid
from datetime import datetime, timezone
from typing import Any, Optional
from fastapi.responses import JSONResponse


def _ts() -> str:
    return datetime.now(timezone.utc).isoformat()


def success(data: Any, status_code: int = 200, meta: Optional[dict] = None) -> JSONResponse:
    body: dict = {
        "success": True,
        "data": data,
        "timestamp": _ts(),
        "requestId": str(uuid.uuid4()),
    }
    if meta:
        body["meta"] = meta
    return JSONResponse(status_code=status_code, content=body)


def paginated(data: list, page: int, limit: int, total: int) -> JSONResponse:
    total_pages = max(1, (total + limit - 1) // limit)
    return success(
        data=data,
        meta={
            "page": page,
            "limit": limit,
            "total": total,
            "total_pages": total_pages,
            "has_more": page < total_pages,
        },
    )


def error(
    code: str,
    message: str,
    status_code: int = 400,
    details: Optional[Any] = None,
) -> JSONResponse:
    err: dict = {"code": code, "message": message}
    if details is not None:
        err["details"] = details
    return JSONResponse(
        status_code=status_code,
        content={
            "success": False,
            "error": err,
            "timestamp": _ts(),
            "requestId": str(uuid.uuid4()),
        },
    )
