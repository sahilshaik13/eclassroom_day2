"""
Google Meet routes — teacher OAuth, meeting CRUD, student listing.

GET  /api/v1/meet/google/status
GET  /api/v1/meet/google/authorize
GET  /api/v1/meet/google/callback
DELETE /api/v1/meet/google/disconnect
GET  /api/v1/meet/teacher/meetings/today
GET  /api/v1/meet/classes/{class_id}/meetings
POST /api/v1/meet/classes/{class_id}/meetings
PATCH /api/v1/meet/meetings/{meeting_id}
DELETE /api/v1/meet/meetings/{meeting_id}
GET  /api/v1/meet/student/classes/{class_id}/meetings
"""
import logging
from typing import Optional
from uuid import UUID

from dateutil.parser import isoparse
from fastapi import APIRouter, Depends, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.deps import require_student, require_teacher, TokenData
from app.core.response import error, success
from app.db.supabase import get_admin_client
from app.services import google_meet_service as meet_svc
from app.services.google_meet_service import GoogleMeetError

_logger = logging.getLogger(__name__)

router = APIRouter(prefix="/meet", tags=["meet"])


def _frontend_redirect(path_query: str) -> RedirectResponse:
    base = settings.FRONTEND_URL.rstrip("/")
    return RedirectResponse(f"{base}{path_query}", status_code=302)


class CreateMeetingRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    start_at: str
    duration_minutes: int = Field(ge=15, le=480, default=60)
    timezone: str = "UTC"
    scheduled_date: Optional[str] = None


class UpdateMeetingRequest(BaseModel):
    start_at: str
    duration_minutes: int = Field(ge=15, le=480, default=60)
    timezone: str = "UTC"
    scheduled_date: Optional[str] = None
    title: Optional[str] = Field(default=None, max_length=200)


def _meet_error(exc: GoogleMeetError):
    return error(exc.code, exc.message, status_code=exc.status)


@router.get("/google/status")
async def google_status(token: TokenData = Depends(require_teacher)):
    connected = await meet_svc.has_google_token(str(token.user_id))
    return success({"connected": connected})


@router.get("/google/authorize")
async def google_authorize(
    class_id: UUID,
    token: TokenData = Depends(require_teacher),
    return_path: str = "/teacher/study-plan",
    title: Optional[str] = None,
    start_at: Optional[str] = None,
    duration_minutes: Optional[int] = None,
    timezone: str = "UTC",
    scheduled_date: Optional[str] = None,
):
    try:
        class_row = await meet_svc.get_class_row(str(class_id), str(token.tenant_id))
        meet_svc.verify_class_access(token, class_row)
        pending = None
        if title and start_at and duration_minutes:
            pending = meet_svc.new_pending_meeting(
                title,
                start_at,
                duration_minutes,
                timezone,
                scheduled_date,
            )
        url = meet_svc.build_authorize_url(
            user_id=str(token.user_id),
            tenant_id=str(token.tenant_id),
            class_id=str(class_id),
            return_path=return_path,
            pending_meeting=pending,
        )
        return success({"auth_url": url})
    except GoogleMeetError as exc:
        return _meet_error(exc)


@router.get("/google/callback")
async def google_callback(
    code: Optional[str] = None,
    state: Optional[str] = None,
    error_param: Optional[str] = Query(None, alias="error"),
):
    if error_param or not code or not state:
        return _frontend_redirect("/teacher/study-plan?google_meet=denied")
    try:
        redirect_url, _ = await meet_svc.complete_oauth_callback(code=code, state=state)
        return RedirectResponse(redirect_url, status_code=302)
    except GoogleMeetError as exc:
        _logger.warning("Google OAuth callback failed: %s", exc.message)
        return _frontend_redirect("/teacher/study-plan?google_meet=error")
    except Exception:
        _logger.exception("Google OAuth callback failed")
        return _frontend_redirect("/teacher/study-plan?google_meet=error")


@router.delete("/google/disconnect")
async def google_disconnect(token: TokenData = Depends(require_teacher)):
    await meet_svc.disconnect_google(str(token.user_id))
    return success({"disconnected": True})


@router.get("/teacher/meetings/today")
async def teacher_today_meetings(token: TokenData = Depends(require_teacher)):
    try:
        meetings = await meet_svc.list_teacher_meetings_today(token)
        return success(meetings or [])
    except Exception as exc:
        _logger.exception("teacher_today_meetings failed: %s", exc)
        return success([])


@router.get("/classes/{class_id}/meetings")
async def list_class_meetings(
    class_id: UUID,
    token: TokenData = Depends(require_teacher),
):
    try:
        class_row = await meet_svc.get_class_row(str(class_id), str(token.tenant_id))
        meet_svc.verify_class_access(token, class_row)
        meetings = await meet_svc.list_upcoming_meetings(str(class_id))
        return success(meetings)
    except GoogleMeetError as exc:
        return _meet_error(exc)


@router.post("/classes/{class_id}/meetings")
async def create_class_meeting(
    class_id: UUID,
    body: CreateMeetingRequest,
    token: TokenData = Depends(require_teacher),
):
    try:
        start_at = isoparse(body.start_at)
        if start_at.tzinfo is None:
            from datetime import timezone

            start_at = start_at.replace(tzinfo=timezone.utc)
        meeting = await meet_svc.create_meeting_for_class(
            token,
            str(class_id),
            title=body.title.strip(),
            start_at=start_at,
            duration_minutes=body.duration_minutes,
            timezone_name=body.timezone or "UTC",
            scheduled_date=body.scheduled_date,
        )
        return success(meeting, status_code=201)
    except GoogleMeetError as exc:
        if exc.code == "GOOGLE_AUTH_REQUIRED":
            url = meet_svc.build_authorize_url(
                user_id=str(token.user_id),
                tenant_id=str(token.tenant_id),
                class_id=str(class_id),
                return_path="/teacher/study-plan",
                pending_meeting=meet_svc.new_pending_meeting(
                    body.title.strip(),
                    body.start_at,
                    body.duration_minutes,
                    body.timezone or "UTC",
                    body.scheduled_date,
                ),
            )
            return error(
                exc.code,
                exc.message,
                status_code=401,
                details={"auth_url": url},
            )
        return _meet_error(exc)


@router.patch("/meetings/{meeting_id}")
async def update_class_meeting(
    meeting_id: UUID,
    body: UpdateMeetingRequest,
    token: TokenData = Depends(require_teacher),
):
    try:
        start_at = isoparse(body.start_at)
        if start_at.tzinfo is None:
            from datetime import timezone as tz

            start_at = start_at.replace(tzinfo=tz.utc)
        meeting = await meet_svc.update_meeting_schedule(
            token,
            str(meeting_id),
            start_at=start_at,
            duration_minutes=body.duration_minutes,
            timezone_name=body.timezone or "UTC",
            scheduled_date=body.scheduled_date,
            title=body.title.strip() if body.title else None,
        )
        return success(meeting)
    except GoogleMeetError as exc:
        return _meet_error(exc)


@router.delete("/meetings/{meeting_id}")
async def delete_class_meeting(
    meeting_id: UUID,
    token: TokenData = Depends(require_teacher),
):
    try:
        admin = get_admin_client()
        existing = (
            admin.table("class_meetings")
            .select("*")
            .eq("id", str(meeting_id))
            .eq("tenant_id", str(token.tenant_id))
            .maybe_single()
            .execute()
        )
        row = existing.data
        if not row:
            raise GoogleMeetError("NOT_FOUND", "Meeting not found", status=404)
        class_row = await meet_svc.get_class_row(row["class_id"], str(token.tenant_id))
        meet_svc.verify_class_access(token, class_row)
        admin.table("class_meetings").delete().eq("id", str(meeting_id)).execute()
        from app.services.realtime_events import broadcast_class_meeting_changed

        await broadcast_class_meeting_changed(
            str(token.tenant_id),
            row["class_id"],
            row,
            event="meeting_deleted",
        )
        return success({"deleted": True, "id": str(meeting_id)})
    except GoogleMeetError as exc:
        return _meet_error(exc)


@router.get("/student/meetings/upcoming")
async def student_upcoming_meetings(token: TokenData = Depends(require_student)):
    try:
        meetings = await meet_svc.list_student_upcoming_meetings(str(token.user_id))
        return success(meetings or [])
    except Exception as exc:
        _logger.exception("student_upcoming_meetings failed: %s", exc)
        return success([])


@router.get("/student/meetings/today")
async def student_today_meetings(token: TokenData = Depends(require_student)):
    try:
        meetings = await meet_svc.list_student_meetings_today(str(token.user_id))
        return success(meetings or [])
    except Exception as exc:
        _logger.exception("student_today_meetings failed: %s", exc)
        return success([])


@router.get("/student/classes/{class_id}/meetings")
async def student_list_meetings(
    class_id: UUID,
    token: TokenData = Depends(require_student),
):
    admin = get_admin_client()
    enroll = (
        admin.table("class_enrollments")
        .select("id, students!inner(user_id)")
        .eq("class_id", str(class_id))
        .execute()
    )
    allowed = any(
        (r.get("students") or {}).get("user_id") == token.user_id
        for r in (enroll.data or [])
    )
    if not allowed:
        return error("FORBIDDEN", "Not enrolled in this class", status_code=403)
    meetings = await meet_svc.list_upcoming_meetings(str(class_id))
    return success(meetings)
