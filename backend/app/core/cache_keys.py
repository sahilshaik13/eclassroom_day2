"""Tenant-scoped Redis cache key builders.

All keys prefixed with 'v2:' for cache versioning.
This ensures old cache data is ignored after deployment.
"""
from __future__ import annotations

from typing import Optional

# Cache version prefix - bump this when making breaking cache changes
_CACHE_VERSION = "v2"


def tenant_prefix(tenant_id: str) -> str:
    return str(tenant_id)


def key(*parts: str) -> str:
    """Build a cache key with version prefix."""
    return _CACHE_VERSION + ":" + ":".join(str(p) for p in parts if str(p))


def admin_stats(tenant_id: str) -> str:
    return key(tenant_prefix(tenant_id), "admin", "stats")


def classroom_study_plan(tenant_id: str, class_id: str) -> str:
    """Teacher edit view — any non-archived plan on the class."""
    return key(tenant_prefix(tenant_id), "classroom", class_id, "study_plan")


def classroom_study_plan_active(tenant_id: str, class_id: str) -> str:
    """Admin / read paths — active plan only."""
    return key(tenant_prefix(tenant_id), "classroom", class_id, "study_plan", "active")


def classroom_study_plan_student(tenant_id: str, class_id: str, student_id: str) -> str:
    return key(tenant_prefix(tenant_id), "classroom", class_id, "study_plan", "student", student_id)


def classroom_study_plan_source(tenant_id: str, class_id: str) -> str:
    return key(tenant_prefix(tenant_id), "classroom", class_id, "study_plan_source")


def import_current(tenant_id: str, class_id: str) -> str:
    return key(tenant_prefix(tenant_id), "classroom", class_id, "import_current")


def teacher_students(tenant_id: str, class_id: str, page: int, limit: int) -> str:
    return key(tenant_prefix(tenant_id), "teacher", "students", class_id, f"p{page}", f"l{limit}")


def student_doubts(tenant_id: str, student_id: str) -> str:
    return key(tenant_prefix(tenant_id), "student", student_id, "doubts")


def teacher_doubts(tenant_id: str, teacher_id: str, status: str) -> str:
    return key(tenant_prefix(tenant_id), "teacher", teacher_id, "doubts", status or "all")


def today_tasks(tenant_id: str, student_id: str) -> str:
    return key(tenant_prefix(tenant_id), "student", student_id, "tasks_today")


def teacher_pulse(tenant_id: str, teacher_id: str) -> str:
    return key(tenant_prefix(tenant_id), "teacher", teacher_id, "pulse_today")


def competitions_list(tenant_id: str) -> str:
    return key(tenant_prefix(tenant_id), "competitions", "list")


def student_competitions(user_id: str) -> str:
    return key("student", user_id, "competitions", "registrations")


def competition_info(competition_id: str) -> str:
    return key("competition", competition_id, "info")


def student_exam_draft(user_id: str, competition_id: str) -> str:
    return key("student", user_id, "competition", competition_id, "exam_draft")


def progress_report(tenant_id: str, student_id: str, month: str) -> str:
    return key(tenant_prefix(tenant_id), "report", student_id, month)


def class_progress_hash(tenant_id: str, class_id: str) -> str:
    return key(tenant_prefix(tenant_id), "class", class_id, "progress_hash")


def competition_leaderboard(competition_id: str) -> str:
    return key("competition", competition_id, "leaderboard")


def upload_lock(class_id: str) -> str:
    return key("lock", "study_plan_import", class_id)


def class_access_counter(class_id: str) -> str:
    return key("access", "class", class_id)


def super_admin_stats() -> str:
    return key("platform", "super_admin", "stats")


def super_admin_tenants() -> str:
    return key("platform", "super_admin", "tenants")


def super_admin_audit_total(tenant_id: Optional[str] = None) -> str:
    if tenant_id:
        return key("platform", "super_admin", "audit_total", tenant_id)
    return key("platform", "super_admin", "audit_total")


def super_admin_audit_page(
    page: int,
    limit: int,
    tenant_id: Optional[str] = None,
) -> str:
    tenant_key = tenant_id or "all"
    return key("platform", "super_admin", "audit_page", tenant_key, str(page), str(limit))


def teacher_dashboard(tenant_id: str, teacher_id: str) -> str:
    return key(tenant_prefix(tenant_id), "teacher", teacher_id, "dashboard")


def teacher_student_overview(tenant_id: str, teacher_id: str, student_id: str) -> str:
    return key(tenant_prefix(tenant_id), "teacher", teacher_id, "student", student_id, "overview")


def student_tasks_today(tenant_id: str, student_id: str, day_iso: str) -> str:
    return key(tenant_prefix(tenant_id), "student", student_id, "tasks", day_iso)


def public_tenant(slug: str) -> str:
    return key("public", "tenant", slug.lower())
