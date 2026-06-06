"""Doubts PostgREST queries with schema fallbacks for older databases."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

_logger = logging.getLogger(__name__)

# Newest → oldest select shapes (stop at first success).
_TEACHER_DOUBT_SELECTS = (
    "*, students(id, name), "
    "doubt_responses(id, body, reply_type, audio_url, file_url, file_name, created_at, client_sent_at)",
    "*, students(id, name), "
    "doubt_responses(id, body, reply_type, audio_url, file_url, file_name, created_at)",
    "*, students(name), doubt_responses(id, body, created_at)",
    "*, doubt_responses(id, body, created_at)",
    "*",
)

_STUDENT_DOUBT_SELECTS = (
    "*, doubt_responses("
    "id, body, reply_type, audio_url, file_url, file_name, created_at, client_sent_at"
    ")",
    "*, doubt_responses("
    "id, body, reply_type, audio_url, file_url, file_name, created_at"
    ")",
    "*, doubt_responses(id, body, created_at)",
    "*",
)


def doubt_title_for_db(body: str) -> str:
    """DB requires title; chat UI uses body only."""
    line = (body or "").strip().split("\n")[0].strip()
    return (line[:100] if line else "Message")


def sanitize_doubts_for_chat(rows: list[dict]) -> list[dict]:
    """Strip subject/teacher labels so chat endpoints do not duplicate message text."""
    out: list[dict] = []
    for row in rows or []:
        d = dict(row)
        d["title"] = None
        for key in ("doubt_responses", "responses"):
            responses = d.get(key)
            if not isinstance(responses, list):
                continue
            cleaned = []
            for resp in responses:
                r = dict(resp)
                r.pop("teacher_name", None)
                r.pop("users", None)
                cleaned.append(r)
            d[key] = cleaned
        out.append(d)
    return out


def _execute(client: Any, query: Any) -> Any:
    res = query.execute()
    if getattr(res, "error", None):
        raise RuntimeError(str(res.error))
    return res


def _exclude_archived_doubts(query: Any) -> Any:
    """Chat lists only show active thread messages."""
    return query.neq("status", "archived")


def fetch_teacher_class_doubts(
    client: Any,
    class_ids: list[str],
    status: Optional[str] = None,
) -> list[dict]:
    last_err: Optional[Exception] = None
    for select in _TEACHER_DOUBT_SELECTS:
        try:
            q = (
                client.table("doubts")
                .select(select)
                .in_("class_id", class_ids)
                .order("created_at", desc=True)
            )
            q = _exclude_archived_doubts(q)
            if status:
                q = q.eq("status", status)
            res = _execute(client, q)
            return sanitize_doubts_for_chat(res.data or [])
        except Exception as exc:
            last_err = exc
            _logger.warning("teacher doubts select failed (%s): %s", select[:60], exc)
    if last_err:
        raise last_err
    return []


def fetch_student_doubts(
    client: Any,
    student_id: str,
    status: Optional[str] = None,
) -> list[dict]:
    last_err: Optional[Exception] = None
    for select in _STUDENT_DOUBT_SELECTS:
        try:
            q = (
                client.table("doubts")
                .select(select)
                .eq("student_id", student_id)
                .order("created_at", desc=True)
            )
            q = _exclude_archived_doubts(q)
            if status:
                q = q.eq("status", status)
            res = _execute(client, q)
            return sanitize_doubts_for_chat(res.data or [])
        except Exception as exc:
            last_err = exc
            _logger.warning("student doubts select failed (%s): %s", select[:60], exc)
    if last_err:
        raise last_err
    return []


def mark_doubts_seen_by_teacher(client: Any, doubt_ids: list[str]) -> int:
    """Set teacher_seen_at on doubts the teacher has opened. No-op if column missing."""
    if not doubt_ids:
        return 0
    seen_at = datetime.now(timezone.utc).isoformat()
    try:
        res = _execute(
            client,
            client.table("doubts")
            .update({"teacher_seen_at": seen_at})
            .in_("id", doubt_ids)
            .is_("teacher_seen_at", "null"),
        )
        return len(res.data or [])
    except Exception as exc:
        _logger.warning("mark_doubts_seen_by_teacher failed: %s", exc)
        return 0


def insert_student_doubt(client: Any, row: dict) -> dict:
    """Insert student doubt; fall back if media columns are not migrated yet."""
    minimal = {
        "student_id": row["student_id"],
        "tenant_id": row["tenant_id"],
        "class_id": row["class_id"],
        "title": row.get("title") or "Message",
        "body": row.get("body") or "",
        "status": row.get("status") or "pending",
    }
    if row.get("task_id"):
        minimal["task_id"] = row["task_id"]
    try:
        res = _execute(client, client.table("doubts").insert(row))
        return res.data[0] if res.data else {}
    except Exception as exc:
        _logger.warning("doubts full insert failed, retrying minimal: %s", exc)
        res = _execute(client, client.table("doubts").insert(minimal))
        return res.data[0] if res.data else {}


def _archive_doubts_by_ids(
    client: Any,
    doubt_ids: list[str],
    archived_by: Optional[str] = None,
) -> int:
    """Hide doubts from chat; rows and replies remain in the database."""
    if not doubt_ids:
        return 0
    archived_at = datetime.now(timezone.utc).isoformat()
    payload: dict = {"status": "archived", "archived_at": archived_at}
    if archived_by:
        payload["archived_by"] = archived_by
    try:
        _execute(client, client.table("doubts").update(payload).in_("id", doubt_ids))
    except Exception as exc:
        _logger.warning("doubts archive with metadata failed, retrying status only: %s", exc)
        _execute(
            client,
            client.table("doubts").update({"status": "archived"}).in_("id", doubt_ids),
        )
    return len(doubt_ids)


def _active_doubt_ids_query(client: Any):
    return _exclude_archived_doubts(client.table("doubts").select("id"))


def archive_student_class_doubts(
    client: Any,
    student_id: str,
    class_id: str,
    archived_by: Optional[str] = None,
) -> int:
    """Archive all doubts for one student in one class (clear chat)."""
    res = _execute(
        client,
        _active_doubt_ids_query(client)
        .eq("student_id", student_id)
        .eq("class_id", class_id),
    )
    ids = [str(r["id"]) for r in (res.data or []) if r.get("id")]
    return _archive_doubts_by_ids(client, ids, archived_by)


def archive_teacher_student_thread(
    client: Any,
    class_ids: list[str],
    student_id: str,
    archived_by: Optional[str] = None,
) -> int:
    """Archive all active doubts from a student across the teacher's classes."""
    if not class_ids:
        return 0
    res = _execute(
        client,
        _active_doubt_ids_query(client)
        .eq("student_id", student_id)
        .in_("class_id", class_ids),
    )
    ids = [str(r["id"]) for r in (res.data or []) if r.get("id")]
    return _archive_doubts_by_ids(client, ids, archived_by)


# Backwards-compatible aliases (archive, do not delete).
clear_student_class_doubts = archive_student_class_doubts
clear_teacher_student_thread = archive_teacher_student_thread


def insert_doubt_response(client: Any, row: dict) -> dict:
    """Insert reply; fall back if media columns are not migrated yet."""
    minimal = {
        "doubt_id": row["doubt_id"],
        "teacher_id": row["teacher_id"],
        "tenant_id": row["tenant_id"],
        "body": row.get("body") or "",
    }
    try:
        res = _execute(client, client.table("doubt_responses").insert(row))
        return res.data[0] if res.data else {}
    except Exception as exc:
        _logger.warning("doubt_responses full insert failed, retrying minimal: %s", exc)
        res = _execute(client, client.table("doubt_responses").insert(minimal))
        return res.data[0] if res.data else {}
