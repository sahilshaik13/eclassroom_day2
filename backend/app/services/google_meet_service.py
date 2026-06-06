"""Google OAuth + Calendar API for class Google Meet links."""

from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional
from urllib.parse import urlencode

import httpx
import jwt as pyjwt

from app.core.config import settings  # noqa: F401 — used by complete_oauth_callback
from app.core.google_token_crypto import decrypt_refresh_token, encrypt_refresh_token
from app.db.supabase import get_admin_client

_logger = logging.getLogger(__name__)

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
CALENDAR_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
SCOPE = "https://www.googleapis.com/auth/calendar.events"


class GoogleMeetError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        self.code = code
        self.message = message
        self.status = status
        super().__init__(message)


def _google_configured() -> bool:
    return bool(
        settings.GOOGLE_OAUTH_CLIENT_ID.strip()
        and settings.GOOGLE_OAUTH_CLIENT_SECRET.strip()
        and settings.google_oauth_redirect_uri.strip()
    )


def _encode_state(payload: dict) -> str:
    body = {**payload, "exp": datetime.now(timezone.utc) + timedelta(minutes=15)}
    return pyjwt.encode(body, settings.SUPABASE_JWT_SECRET, algorithm="HS256")


def decode_oauth_state(state: str) -> dict:
    try:
        return pyjwt.decode(
            state,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
        )
    except pyjwt.PyJWTError as exc:
        raise GoogleMeetError("INVALID_STATE", "OAuth state is invalid or expired") from exc


def build_authorize_url(
    *,
    user_id: str,
    tenant_id: str,
    class_id: str,
    return_path: str,
    pending_meeting: Optional[dict] = None,
) -> str:
    if not _google_configured():
        raise GoogleMeetError(
            "GOOGLE_NOT_CONFIGURED",
            "Google Meet is not configured on the server",
            status=503,
        )
    state = _encode_state(
        {
            "sub": user_id,
            "tenant_id": tenant_id,
            "class_id": class_id,
            "return_path": return_path or "/teacher/study-plan",
            "pending": pending_meeting,
        }
    )
    params = {
        "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
        "redirect_uri": settings.google_oauth_redirect_uri,
        "response_type": "code",
        "scope": SCOPE,
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


async def _http_post_token(data: dict) -> dict:
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.post(GOOGLE_TOKEN_URL, data=data)
    if res.status_code >= 400:
        _logger.warning("Google token error: %s", res.text[:500])
        raise GoogleMeetError(
            "GOOGLE_TOKEN_ERROR",
            "Could not exchange Google authorization",
            status=502,
        )
    return res.json()


async def exchange_code_and_store(
    *,
    code: str,
    user_id: str,
    tenant_id: str,
) -> dict:
    payload = {
        "code": code,
        "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
        "client_secret": settings.GOOGLE_OAUTH_CLIENT_SECRET,
        "redirect_uri": settings.google_oauth_redirect_uri,
        "grant_type": "authorization_code",
    }
    tokens = await _http_post_token(payload)
    refresh = tokens.get("refresh_token")
    if not refresh:
        raise GoogleMeetError(
            "NO_REFRESH_TOKEN",
            "Google did not return a refresh token. Try disconnecting the app in Google Account settings and connect again.",
        )
    await _upsert_refresh_token(user_id, tenant_id, refresh)
    return tokens


async def _upsert_refresh_token(user_id: str, tenant_id: str, refresh: str) -> None:
    admin = get_admin_client()
    encrypted = encrypt_refresh_token(refresh)
    row = {
        "user_id": user_id,
        "tenant_id": tenant_id,
        "refresh_token_encrypted": encrypted,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    existing = (
        admin.table("teacher_google_tokens")
        .select("user_id")
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if existing and existing.data:
        admin.table("teacher_google_tokens").update(row).eq("user_id", user_id).execute()
    else:
        admin.table("teacher_google_tokens").insert(row).execute()


async def has_google_token(user_id: str) -> bool:
    admin = get_admin_client()
    res = (
        admin.table("teacher_google_tokens")
        .select("user_id")
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    return bool(res and res.data)


async def disconnect_google(user_id: str) -> None:
    admin = get_admin_client()
    admin.table("teacher_google_tokens").delete().eq("user_id", user_id).execute()


async def _get_access_token(user_id: str) -> str:
    admin = get_admin_client()
    res = (
        admin.table("teacher_google_tokens")
        .select("refresh_token_encrypted")
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if not res or not res.data:
        raise GoogleMeetError(
            "GOOGLE_AUTH_REQUIRED",
            "Connect your Google account to create meetings",
            status=401,
        )
    refresh = decrypt_refresh_token(res.data["refresh_token_encrypted"])
    payload = {
        "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
        "client_secret": settings.GOOGLE_OAUTH_CLIENT_SECRET,
        "refresh_token": refresh,
        "grant_type": "refresh_token",
    }
    tokens = await _http_post_token(payload)
    access = tokens.get("access_token")
    if not access:
        raise GoogleMeetError(
            "GOOGLE_AUTH_EXPIRED",
            "Google authorization expired. Please connect again.",
            status=401,
        )
    return access


def verify_class_access(token: Any, class_row: dict) -> None:
    role = token.role
    if role in ("admin", "platform_admin"):
        return
    if role == "teacher" and str(class_row.get("teacher_id")) == str(token.user_id):
        return
    raise GoogleMeetError("FORBIDDEN", "You do not have access to this class", status=403)


async def get_class_row(class_id: str, tenant_id: str) -> dict:
    admin = get_admin_client()
    res = (
        admin.table("classes")
        .select("id,name,teacher_id,tenant_id")
        .eq("id", class_id)
        .eq("tenant_id", tenant_id)
        .maybe_single()
        .execute()
    )
    if not res or not res.data:
        raise GoogleMeetError("NOT_FOUND", "Class not found", status=404)
    return res.data


async def create_calendar_meet(
    *,
    user_id: str,
    title: str,
    start_at: datetime,
    end_at: datetime,
    timezone_name: str = "UTC",
) -> dict:
    access = await _get_access_token(user_id)
    request_id = f"meet-{uuid.uuid4().hex[:16]}"
    body = {
        "summary": title,
        "start": {
            "dateTime": start_at.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S"),
            "timeZone": timezone_name,
        },
        "end": {
            "dateTime": end_at.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S"),
            "timeZone": timezone_name,
        },
        "conferenceData": {
            "createRequest": {
                "requestId": request_id,
                "conferenceSolutionKey": {"type": "hangoutsMeet"},
            }
        },
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.post(
            CALENDAR_EVENTS_URL,
            params={"conferenceDataVersion": "1"},
            headers={"Authorization": f"Bearer {access}"},
            json=body,
        )
    if res.status_code >= 400:
        _logger.warning("Calendar API error %s: %s", res.status_code, res.text[:500])
        if res.status_code in (401, 403):
            raise GoogleMeetError(
                "GOOGLE_AUTH_EXPIRED",
                "Google Calendar access was revoked. Please connect again.",
                status=401,
            )
        raise GoogleMeetError(
            "CALENDAR_API_ERROR",
            "Google Calendar could not create the meeting",
            status=502,
        )
    event = res.json()
    meet_url = event.get("hangoutLink") or _extract_meet_link(event)
    if not meet_url:
        raise GoogleMeetError(
            "NO_MEET_LINK",
            "Google did not return a Meet link",
            status=502,
        )
    return {"meet_url": meet_url, "google_event_id": event.get("id")}


async def update_calendar_event(
    *,
    user_id: str,
    google_event_id: str,
    title: str,
    start_at: datetime,
    end_at: datetime,
    timezone_name: str = "UTC",
) -> None:
    access = await _get_access_token(user_id)
    body = {
        "summary": title,
        "start": {
            "dateTime": start_at.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S"),
            "timeZone": timezone_name,
        },
        "end": {
            "dateTime": end_at.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S"),
            "timeZone": timezone_name,
        },
    }
    url = f"{CALENDAR_EVENTS_URL}/{google_event_id}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.patch(
            url,
            headers={"Authorization": f"Bearer {access}"},
            json=body,
        )
    if res.status_code >= 400:
        _logger.warning("Calendar PATCH error %s: %s", res.status_code, res.text[:500])
        if res.status_code in (401, 403):
            raise GoogleMeetError(
                "GOOGLE_AUTH_EXPIRED",
                "Google Calendar access was revoked. Please connect again.",
                status=401,
            )
        raise GoogleMeetError(
            "CALENDAR_API_ERROR",
            "Google Calendar could not update the meeting",
            status=502,
        )


def _extract_meet_link(event: dict) -> Optional[str]:
    for entry in event.get("conferenceData", {}).get("entryPoints", []) or []:
        if entry.get("entryPointType") == "video":
            return entry.get("uri")
    return None


async def save_class_meeting(
    *,
    tenant_id: str,
    class_id: str,
    teacher_user_id: str,
    title: str,
    start_at: datetime,
    end_at: datetime,
    meet_url: str,
    google_event_id: Optional[str],
    scheduled_date: Optional[str] = None,
) -> dict:
    admin = get_admin_client()
    row = {
        "tenant_id": tenant_id,
        "class_id": class_id,
        "teacher_user_id": teacher_user_id,
        "title": title,
        "start_at": start_at.astimezone(timezone.utc).isoformat(),
        "end_at": end_at.astimezone(timezone.utc).isoformat(),
        "meet_url": meet_url,
        "google_event_id": google_event_id,
        "scheduled_date": scheduled_date,
    }
    res = admin.table("class_meetings").insert(row).execute()
    if res and res.data:
        inserted = res.data[0] if isinstance(res.data, list) else res.data
        if inserted:
            return inserted
    return row


async def archive_ended_meetings(
    *,
    tenant_id: str,
    class_ids: list[str],
) -> int:
    """Move meetings past end_at into class_meetings_archives and delete from active table."""
    if not class_ids:
        return 0
    admin = get_admin_client()
    now = datetime.now(timezone.utc).isoformat()
    res = (
        admin.table("class_meetings")
        .select("*")
        .eq("tenant_id", tenant_id)
        .in_("class_id", class_ids)
        .lt("end_at", now)
        .execute()
    )
    rows = res.data or []
    if not rows:
        return 0

    from app.services.realtime_events import broadcast_class_meeting_changed

    archived = 0
    try:
        admin.table("class_meetings_archives").select("id").limit(1).execute()
    except Exception as exc:
        _logger.warning(
            "class_meetings_archives unavailable; run migration 051. %s",
            exc,
        )
        return 0

    for row in rows:
        admin.table("class_meetings_archives").insert(
            {
                "original_meeting_id": row["id"],
                "tenant_id": row["tenant_id"],
                "class_id": row["class_id"],
                "teacher_user_id": row["teacher_user_id"],
                "title": row["title"],
                "start_at": row["start_at"],
                "end_at": row["end_at"],
                "meet_url": row["meet_url"],
                "google_event_id": row.get("google_event_id"),
                "scheduled_date": row.get("scheduled_date"),
                "meeting_created_at": row.get("created_at"),
                "meeting_updated_at": row.get("updated_at"),
            }
        ).execute()
        admin.table("class_meetings").delete().eq("id", row["id"]).execute()
        await broadcast_class_meeting_changed(
            tenant_id,
            str(row["class_id"]),
            row,
            event="meeting_deleted",
        )
        archived += 1
    return archived


def _meeting_is_active(row: dict, *, now_iso: Optional[str] = None) -> bool:
    end_at = row.get("end_at") or ""
    if not end_at:
        return False
    now = now_iso or datetime.now(timezone.utc).isoformat()
    return end_at >= now


def _meeting_on_calendar_day(row: dict, day_iso: str) -> bool:
    scheduled = row.get("scheduled_date")
    if scheduled:
        return str(scheduled)[:10] == day_iso
    start_at = row.get("start_at") or ""
    if isinstance(start_at, str) and len(start_at) >= 10:
        return start_at[:10] == day_iso
    return False


async def list_teacher_meetings_today(token: Any, *, day_iso: Optional[str] = None) -> list[dict]:
    """Meetings scheduled for today across the teacher's classes (or all tenant classes for admins)."""
    try:
        admin = get_admin_client()
        today = day_iso or date.today().isoformat()
        role = getattr(token, "role", "teacher")

        classes_q = (
            admin.table("classes")
            .select("id, name")
            .eq("tenant_id", str(token.tenant_id))
        )
        if role not in ("admin", "platform_admin"):
            classes_q = classes_q.eq("teacher_id", str(token.user_id))
        classes_res = classes_q.execute()
        class_names: dict[str, str] = {}
        class_ids: list[str] = []
        for row in classes_res.data or []:
            cid = str(row.get("id", ""))
            if not cid:
                continue
            class_ids.append(cid)
            class_names[cid] = row.get("name") or "Class"

        if not class_ids:
            return []

        tenant_id = str(token.tenant_id)
        try:
            await archive_ended_meetings(tenant_id=tenant_id, class_ids=class_ids)
        except Exception as exc:
            _logger.warning("archive_ended_meetings skipped: %s", exc)

        now = datetime.now(timezone.utc).isoformat()
        try:
            res = (
                admin.table("class_meetings")
                .select("*")
                .eq("tenant_id", tenant_id)
                .in_("class_id", class_ids)
                .gte("end_at", now)
                .execute()
            )
            rows = res.data or []
        except Exception as exc:
            _logger.warning("class_meetings query unavailable: %s", exc)
            return []

        meetings = [
            r
            for r in rows
            if _meeting_on_calendar_day(r, today) and _meeting_is_active(r, now_iso=now)
        ]
        meetings.sort(key=lambda r: r.get("start_at") or "")
        for row in meetings:
            cid = str(row.get("class_id", ""))
            row["class_name"] = class_names.get(cid, "Class")
        return meetings
    except Exception as exc:
        _logger.exception("list_teacher_meetings_today failed: %s", exc)
        return []


async def list_upcoming_meetings(
    class_id: str,
    *,
    limit: int = 20,
    tenant_id: Optional[str] = None,
) -> list[dict]:
    admin = get_admin_client()
    tid = tenant_id
    if not tid:
        cls_res = (
            admin.table("classes")
            .select("tenant_id")
            .eq("id", class_id)
            .maybe_single()
            .execute()
        )
        if cls_res and cls_res.data:
            tid = str(cls_res.data.get("tenant_id") or "")
    if tid:
        await archive_ended_meetings(tenant_id=tid, class_ids=[class_id])

    now = datetime.now(timezone.utc).isoformat()
    res = (
        admin.table("class_meetings")
        .select("*")
        .eq("class_id", class_id)
        .gte("end_at", now)
        .order("start_at", desc=False)
        .limit(limit)
        .execute()
    )
    return res.data or []


async def list_student_upcoming_meetings(user_id: str, *, limit: int = 20) -> list[dict]:
    """Upcoming meetings across all classes the student is enrolled in."""
    try:
        admin = get_admin_client()
        stu_res = (
            admin.table("students")
            .select("id, tenant_id")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not stu_res.data:
            return []

        student_row = stu_res.data[0]
        enroll_res = (
            admin.table("class_enrollments")
            .select("class_id, classes(id, name)")
            .eq("student_id", student_row["id"])
            .execute()
        )
        class_names: dict[str, str] = {}
        class_ids: list[str] = []
        for row in enroll_res.data or []:
            cid = row.get("class_id")
            if not cid:
                continue
            class_ids.append(str(cid))
            cls = row.get("classes") or {}
            class_names[str(cid)] = cls.get("name") or "Class"

        if not class_ids:
            return []

        student_tenant = str(student_row.get("tenant_id") or "")
        if student_tenant:
            try:
                await archive_ended_meetings(tenant_id=student_tenant, class_ids=class_ids)
            except Exception as exc:
                _logger.warning("archive_ended_meetings skipped: %s", exc)

        now = datetime.now(timezone.utc).isoformat()
        try:
            res = (
                admin.table("class_meetings")
                .select("*")
                .in_("class_id", class_ids)
                .gte("end_at", now)
                .order("start_at", desc=False)
                .limit(limit)
                .execute()
            )
            rows = res.data or []
        except Exception as exc:
            _logger.warning("class_meetings query unavailable: %s", exc)
            return []

        out: list[dict] = []
        for row in rows:
            cid = str(row.get("class_id", ""))
            out.append({**row, "class_name": class_names.get(cid, "Class")})
        return out
    except Exception as exc:
        _logger.exception("list_student_upcoming_meetings failed user_id=%s: %s", user_id, exc)
        return []


async def list_student_meetings_today(user_id: str, *, day_iso: Optional[str] = None) -> list[dict]:
    """Meetings scheduled for today across all classes the student is enrolled in."""
    try:
        admin = get_admin_client()
        today = day_iso or date.today().isoformat()
        stu_res = (
            admin.table("students")
            .select("id, tenant_id")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not stu_res.data:
            return []

        student_row = stu_res.data[0]
        enroll_res = (
            admin.table("class_enrollments")
            .select("class_id, classes(id, name)")
            .eq("student_id", student_row["id"])
            .execute()
        )
        class_names: dict[str, str] = {}
        class_ids: list[str] = []
        for row in enroll_res.data or []:
            cid = row.get("class_id")
            if not cid:
                continue
            class_ids.append(str(cid))
            cls = row.get("classes") or {}
            class_names[str(cid)] = cls.get("name") or "Class"

        if not class_ids:
            return []

        student_tenant = str(student_row.get("tenant_id") or "")
        if student_tenant:
            try:
                await archive_ended_meetings(tenant_id=student_tenant, class_ids=class_ids)
            except Exception as exc:
                _logger.warning("archive_ended_meetings skipped: %s", exc)

        now = datetime.now(timezone.utc).isoformat()
        try:
            res = (
                admin.table("class_meetings")
                .select("*")
                .in_("class_id", class_ids)
                .gte("end_at", now)
                .execute()
            )
            rows = res.data or []
        except Exception as exc:
            _logger.warning("class_meetings query unavailable: %s", exc)
            return []

        meetings = [
            r
            for r in rows
            if _meeting_on_calendar_day(r, today) and _meeting_is_active(r, now_iso=now)
        ]
        meetings.sort(key=lambda r: r.get("start_at") or "")
        for row in meetings:
            cid = str(row.get("class_id", ""))
            row["class_name"] = class_names.get(cid, "Class")
        return meetings
    except Exception as exc:
        _logger.exception("list_student_meetings_today failed user_id=%s: %s", user_id, exc)
        return []


async def get_meeting_row(meeting_id: str, tenant_id: str) -> dict:
    admin = get_admin_client()
    res = (
        admin.table("class_meetings")
        .select("*")
        .eq("id", meeting_id)
        .eq("tenant_id", tenant_id)
        .maybe_single()
        .execute()
    )
    if not res or not res.data:
        raise GoogleMeetError("NOT_FOUND", "Meeting not found", status=404)
    return res.data


async def update_meeting_schedule(
    token: Any,
    meeting_id: str,
    *,
    start_at: datetime,
    duration_minutes: int,
    timezone_name: str = "UTC",
    scheduled_date: Optional[str] = None,
    title: Optional[str] = None,
) -> dict:
    row = await get_meeting_row(meeting_id, str(token.tenant_id))
    class_row = await get_class_row(row["class_id"], str(token.tenant_id))
    verify_class_access(token, class_row)

    end_at = start_at + timedelta(minutes=duration_minutes)
    meeting_title = (title or row.get("title") or "Class meeting").strip()
    google_event_id = row.get("google_event_id")
    teacher_user_id = str(row.get("teacher_user_id") or token.user_id)

    if google_event_id:
        try:
            await update_calendar_event(
                user_id=teacher_user_id,
                google_event_id=google_event_id,
                title=meeting_title,
                start_at=start_at,
                end_at=end_at,
                timezone_name=timezone_name,
            )
        except GoogleMeetError:
            raise
        except Exception:
            _logger.exception("Calendar update failed for meeting %s", meeting_id)

    admin = get_admin_client()
    patch = {
        "title": meeting_title,
        "start_at": start_at.astimezone(timezone.utc).isoformat(),
        "end_at": end_at.astimezone(timezone.utc).isoformat(),
        "scheduled_date": scheduled_date,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    res = (
        admin.table("class_meetings")
        .update(patch)
        .eq("id", meeting_id)
        .execute()
    )
    updated = (res.data[0] if res and res.data else None) or {**row, **patch}
    from app.services.realtime_events import broadcast_class_meeting_changed

    await broadcast_class_meeting_changed(
        str(token.tenant_id),
        row["class_id"],
        updated,
        event="meeting_updated",
    )
    return updated


async def delete_meeting(meeting_id: str, tenant_id: str) -> dict:
    admin = get_admin_client()
    res = (
        admin.table("class_meetings")
        .select("*")
        .eq("id", meeting_id)
        .eq("tenant_id", tenant_id)
        .maybe_single()
        .execute()
    )
    if not res or not res.data:
        raise GoogleMeetError("NOT_FOUND", "Meeting not found", status=404)
    admin.table("class_meetings").delete().eq("id", meeting_id).execute()
    return res.data


async def create_meeting_for_class(
    token: Any,
    class_id: str,
    *,
    title: str,
    start_at: datetime,
    duration_minutes: int,
    timezone_name: str = "UTC",
    scheduled_date: Optional[str] = None,
) -> dict:
    class_row = await get_class_row(class_id, str(token.tenant_id))
    verify_class_access(token, class_row)
    return await _create_meeting_impl(
        user_id=str(token.user_id),
        tenant_id=str(token.tenant_id),
        class_id=class_id,
        title=title,
        start_at=start_at,
        duration_minutes=duration_minutes,
        timezone_name=timezone_name,
        scheduled_date=scheduled_date,
    )


async def _create_meeting_impl(
    *,
    user_id: str,
    tenant_id: str,
    class_id: str,
    title: str,
    start_at: datetime,
    duration_minutes: int,
    timezone_name: str = "UTC",
    scheduled_date: Optional[str] = None,
) -> dict:
    end_at = start_at + timedelta(minutes=duration_minutes)
    cal = await create_calendar_meet(
        user_id=user_id,
        title=title,
        start_at=start_at,
        end_at=end_at,
        timezone_name=timezone_name,
    )
    meeting = await save_class_meeting(
        tenant_id=tenant_id,
        class_id=class_id,
        teacher_user_id=user_id,
        title=title,
        start_at=start_at,
        end_at=end_at,
        meet_url=cal["meet_url"],
        google_event_id=cal.get("google_event_id"),
        scheduled_date=scheduled_date,
    )
    from app.services.realtime_events import broadcast_class_meeting_changed

    await broadcast_class_meeting_changed(
        tenant_id,
        class_id,
        meeting,
        event="meeting_created",
    )
    return meeting


def new_pending_meeting(
    title: str,
    start_at_iso: str,
    duration_minutes: int,
    timezone_name: str,
    scheduled_date: Optional[str],
) -> dict:
    return {
        "title": title,
        "start_at": start_at_iso,
        "duration_minutes": duration_minutes,
        "timezone": timezone_name,
        "scheduled_date": scheduled_date,
    }


async def complete_oauth_callback(
    *,
    code: str,
    state: str,
) -> tuple[str, Optional[dict]]:
    """Returns (frontend_redirect_url, optional_created_meeting)."""
    data = decode_oauth_state(state)
    user_id = data["sub"]
    tenant_id = data["tenant_id"]
    class_id = data["class_id"]
    return_path = data.get("return_path") or "/teacher/study-plan"
    pending = data.get("pending")

    await exchange_code_and_store(code=code, user_id=user_id, tenant_id=tenant_id)

    created: Optional[dict] = None
    meeting_error: Optional[str] = None
    if pending:
        from dateutil.parser import isoparse

        start_at = isoparse(pending["start_at"])
        if start_at.tzinfo is None:
            start_at = start_at.replace(tzinfo=timezone.utc)
        try:
            created = await _create_meeting_impl(
                user_id=user_id,
                tenant_id=tenant_id,
                class_id=class_id,
                title=pending["title"],
                start_at=start_at,
                duration_minutes=int(pending.get("duration_minutes", 60)),
                timezone_name=pending.get("timezone") or "UTC",
                scheduled_date=pending.get("scheduled_date"),
            )
        except GoogleMeetError as exc:
            meeting_error = exc.code
            _logger.warning("Meet create after OAuth failed: %s", exc.message)
        except Exception:
            meeting_error = "MEETING_FAILED"
            _logger.exception("Meet create after OAuth failed")

    base = settings.FRONTEND_URL.rstrip("/")
    query_params: dict[str, str] = {
        "google_meet": "connected",
        "class_id": class_id,
    }
    if created:
        query_params["meeting_created"] = "1"
    if meeting_error:
        query_params["meeting_error"] = meeting_error
    q = urlencode(query_params)
    sep = "&" if "?" in return_path else "?"
    redirect = f"{base}{return_path}{sep}{q}"
    return redirect, created
