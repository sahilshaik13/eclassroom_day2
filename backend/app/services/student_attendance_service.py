"""
Student portal attendance — unique calendar days + IN/OUT access log.

- student_login_attendance: one row per student per calendar day (first IN of the day).
- student_login_attendance_logs: every IN (portal open) and OUT (window/tab close).
"""
from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, timezone
from typing import Any, Literal, Optional

from app.db.supabase import get_admin_client

_logger = logging.getLogger(__name__)

_HISTORY_LIMIT = 365
PortalEventType = Literal["in", "out"]


def _insert_attendance_log(
    admin: Any,
    payload: dict[str, Any],
    logged_at_iso: str,
    event_type: PortalEventType,
) -> None:
    """Insert log row; retry without event_type if column missing."""
    candidates = [
        {**payload, "logged_at": logged_at_iso, "event_type": event_type},
        {**payload, "logged_at": logged_at_iso},
    ]
    last_error: Exception | None = None
    for row in candidates:
        try:
            admin.table("student_login_attendance_logs").insert(row).execute()
            return
        except Exception as exc:
            last_error = exc
            err = str(exc).lower()
            if "event_type" in err or "column" in err or "does not exist" in err:
                continue
            raise
    if last_error:
        raise last_error


def record_portal_event(
    *,
    student_id: Optional[str],
    user_id: Optional[str],
    tenant_id: Optional[str],
    event_type: PortalEventType = "in",
) -> bool:
    """
    Append IN/OUT log row; unique-day row only on first IN that calendar day (UTC).
    Returns True when the log row was written (day row failures are logged separately).
    """
    if not student_id:
        _logger.error("[attendance] missing student_id")
        return False
    if not tenant_id:
        _logger.error("[attendance] missing tenant_id for student_id=%s", student_id)
        return False

    admin = get_admin_client()
    now_utc = datetime.now(timezone.utc)
    login_date = now_utc.date().isoformat()
    payload = {
        "student_id": str(student_id),
        "user_id": str(user_id) if user_id else None,
        "tenant_id": str(tenant_id),
        "login_date": login_date,
    }
    logged_at_iso = now_utc.isoformat()

    try:
        _insert_attendance_log(admin, payload, logged_at_iso, event_type)
    except Exception:
        _logger.exception(
            "[attendance] log insert failed student=%s event=%s", student_id, event_type
        )
        return False

    if event_type == "in":
        try:
            _ensure_unique_day_row(admin, payload, logged_at_iso)
        except Exception:
            _logger.exception(
                "[attendance] unique-day insert failed student=%s", student_id
            )

    return True


def record_portal_access_attendance(
    *,
    student_id: Optional[str],
    user_id: Optional[str],
    tenant_id: Optional[str],
) -> bool:
    return record_portal_event(
        student_id=student_id,
        user_id=user_id,
        tenant_id=tenant_id,
        event_type="in",
    )


def record_portal_exit_attendance(
    *,
    student_id: Optional[str],
    user_id: Optional[str],
    tenant_id: Optional[str],
) -> bool:
    return record_portal_event(
        student_id=student_id,
        user_id=user_id,
        tenant_id=tenant_id,
        event_type="out",
    )


def record_login_attendance(
    *,
    student_id: Optional[str],
    user_id: Optional[str],
    tenant_id: Optional[str],
) -> None:
    record_portal_event(
        student_id=student_id,
        user_id=user_id,
        tenant_id=tenant_id,
        event_type="in",
    )


def _ensure_unique_day_row(admin: Any, payload: dict[str, Any], login_at_iso: str) -> None:
    existing = (
        admin.table("student_login_attendance")
        .select("id")
        .eq("student_id", payload["student_id"])
        .eq("login_date", payload["login_date"])
        .limit(1)
        .execute()
    )
    if existing.data:
        return

    row = {
        **payload,
        "id": str(uuid.uuid4()),
        "login_at": login_at_iso,
        "first_login_at": login_at_iso,
    }
    try:
        admin.table("student_login_attendance").insert(row).execute()
    except Exception as exc:
        msg = str(exc).lower()
        if "first_login_at" in msg:
            admin.table("student_login_attendance").insert(
                {**payload, "id": str(uuid.uuid4()), "login_at": login_at_iso}
            ).execute()
        elif "login_at" in msg:
            admin.table("student_login_attendance").insert(
                {**payload, "id": str(uuid.uuid4())}
            ).execute()
        else:
            raise


def _parse_date(value: Any) -> Optional[date]:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _parse_ts(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        text = str(value).replace("Z", "+00:00")
        dt = datetime.fromisoformat(text)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _format_login_time(dt: datetime) -> str:
    utc = dt.astimezone(timezone.utc)
    return utc.strftime("%I:%M %p UTC").lstrip("0")


def _fetch_all_access_events(admin: Any, student_id: str) -> list[dict[str, Any]]:
    """All IN/OUT log rows, newest first — one API/UI row per event."""
    events: list[dict[str, Any]] = []
    try:
        res = (
            admin.table("student_login_attendance_logs")
            .select("id, login_date, logged_at, event_type")
            .eq("student_id", student_id)
            .order("logged_at", desc=True)
            .limit(5000)
            .execute()
        )
        for row in res.data or []:
            date_key = str(row.get("login_date") or "")[:10]
            ts = _parse_ts(row.get("logged_at"))
            if not date_key or not ts:
                continue
            event_type = str(row.get("event_type") or "in").lower()
            if event_type not in ("in", "out"):
                event_type = "in"
            events.append(
                {
                    "id": str(row.get("id") or ""),
                    "date": date_key,
                    "event_type": event_type,
                    "logged_at": ts.isoformat(),
                }
            )
    except Exception as exc:
        if "event_type" in str(exc).lower():
            try:
                res = (
                    admin.table("student_login_attendance_logs")
                    .select("id, login_date, logged_at")
                    .eq("student_id", student_id)
                    .order("logged_at", desc=True)
                    .limit(5000)
                    .execute()
                )
                for row in res.data or []:
                    date_key = str(row.get("login_date") or "")[:10]
                    ts = _parse_ts(row.get("logged_at"))
                    if date_key and ts:
                        events.append(
                            {
                                "id": str(row.get("id") or ""),
                                "date": date_key,
                                "event_type": "in",
                                "logged_at": ts.isoformat(),
                            }
                        )
            except Exception:
                _logger.exception(
                    "[attendance] failed to load access logs for student %s", student_id
                )
        else:
            _logger.exception(
                "[attendance] failed to load access logs for student %s", student_id
            )
    return events


def format_in_out_details(events: list[dict[str, Any]]) -> str:
    if not events:
        return "Present"
    parts: list[str] = []
    for ev in events:
        ts = ev.get("logged_at")
        if not isinstance(ts, datetime):
            continue
        label = "IN" if ev.get("event_type") == "in" else "OUT"
        parts.append(f"{label} {_format_login_time(ts)}")
    if not parts:
        return "Present"
    if len(parts) > 10:
        return " · ".join(parts[:10]) + f" (+{len(parts) - 10} more)"
    return " · ".join(parts)


def format_attendance_details(
    logged_at: Optional[datetime],
    *,
    session_count: int = 1,
    access_times: Optional[list[datetime]] = None,
    access_events: Optional[list[dict[str, Any]]] = None,
) -> str:
    if access_events:
        return format_in_out_details(access_events)
    times = sorted(access_times) if access_times else ([logged_at] if logged_at else [])
    if not times:
        return "Present"
    if len(times) == 1:
        return f"IN {_format_login_time(times[0])}"
    labels = [_format_login_time(t) for t in times[:8]]
    suffix = f" (+{len(times) - 8} more)" if len(times) > 8 else ""
    return f"{len(times)} accesses: {', '.join(labels)}{suffix}"


def history_from_last_login(last_login: Any) -> tuple[list[dict[str, Any]], int]:
    first_at = _parse_ts(last_login)
    if not first_at:
        return [], 0
    date_key = first_at.date().isoformat()
    row = {
        "date": date_key,
        "status": "Present",
        "details": format_attendance_details(
            first_at, access_events=[{"logged_at": first_at, "event_type": "in"}]
        ),
        "first_login_at": first_at.isoformat(),
        "logged_at": first_at.isoformat(),
        "session_count": 1,
        "access_events": [{"event_type": "in", "logged_at": first_at.isoformat()}],
    }
    return [row], 1


def apply_last_login_fallback(attendance: dict[str, Any], last_login: Any) -> dict[str, Any]:
    if attendance.get("attendance_history") or not last_login:
        return attendance
    history, streak = history_from_last_login(last_login)
    if not history:
        return attendance
    out = dict(attendance)
    out["attendance_history"] = history
    out["attendance_streak"] = streak
    return out


def compute_login_streak(login_rows: list[dict[str, Any]]) -> int:
    dates: list[date] = []
    for row in login_rows:
        d = _parse_date(row.get("login_date"))
        if d:
            dates.append(d)
    dates = sorted(set(dates), reverse=True)
    if not dates:
        return 0
    streak = 1
    for i in range(1, len(dates)):
        if (dates[i - 1] - dates[i]).days == 1:
            streak += 1
        else:
            break
    return streak


def fetch_teacher_attendance_view(student_id: str) -> dict[str, Any]:
    admin = get_admin_client()

    day_rows: list[dict[str, Any]] = []
    try:
        res = (
            admin.table("student_login_attendance")
            .select("login_date, login_at, first_login_at, created_at")
            .eq("student_id", student_id)
            .order("login_date", desc=True)
            .limit(_HISTORY_LIMIT)
            .execute()
        )
        day_rows = list(res.data or [])
    except Exception:
        try:
            res = (
                admin.table("student_login_attendance")
                .select("login_date, created_at")
                .eq("student_id", student_id)
                .order("login_date", desc=True)
                .limit(_HISTORY_LIMIT)
                .execute()
            )
            day_rows = list(res.data or [])
        except Exception:
            _logger.exception(
                "[attendance] failed to load unique days for student %s", student_id
            )

    present_dates = {
        str(row.get("login_date") or "")[:10]
        for row in day_rows
        if row.get("login_date")
    }
    streak = compute_login_streak(day_rows)

    # Teacher UI: one row per calendar day (student_login_attendance), not per IN/OUT log.
    history: list[dict[str, Any]] = []
    for row in day_rows:
        date_key = str(row.get("login_date") or "")[:10]
        if not date_key:
            continue
        first_at = (
            _parse_ts(row.get("first_login_at"))
            or _parse_ts(row.get("login_at"))
            or _parse_ts(row.get("created_at"))
        )
        history.append(
            {
                "id": str(row.get("id") or f"{student_id}-{date_key}"),
                "date": date_key,
                "status": "Present",
                "logged_at": first_at.isoformat() if first_at else None,
                "first_login_at": first_at.isoformat() if first_at else None,
                "details": (
                    f"Check-in {_format_login_time(first_at)}" if first_at else "Present"
                ),
            }
        )

    attendance_days = sorted(present_dates, reverse=True)

    return {
        "attendance_streak": streak,
        "attendance_history": history,
        "attendance_days": attendance_days,
    }
