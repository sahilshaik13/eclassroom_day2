"""
Super-admin platform reads — parallel Supabase queries + Redis cache.

Avoids N+1 tenant count queries and serial stats round-trips to cloud PostgREST.
"""
from __future__ import annotations

import asyncio
import logging
import time
from collections import defaultdict
from typing import Any

import httpx

from app.core import cache_keys
from app.core import cache_ttl
from app.core.cache_service import cache_delete, get_or_set_cache
from app.db.supabase import get_admin_client

_logger = logging.getLogger(__name__)

def _count_result(res: Any) -> int:
    return int(res.count or 0) if res else 0


_RETRIABLE_HTTP_ERRORS = (
    httpx.RemoteProtocolError,
    httpx.ReadTimeout,
    httpx.ReadError,
    httpx.ConnectError,
)


def _execute_with_retry(query_builder: Any, *, label: str, attempts: int = 3) -> Any:
    """Retry transient transport errors from PostgREST/httpx."""
    delay_seconds = 0.2
    for attempt in range(1, attempts + 1):
        try:
            return query_builder.execute()
        except _RETRIABLE_HTTP_ERRORS as exc:
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


async def invalidate_super_admin_cache(tenant_id: str | None = None) -> None:
    keys = [
        cache_keys.super_admin_stats(),
        cache_keys.super_admin_tenants(),
        cache_keys.super_admin_audit_total(),
    ]
    if tenant_id:
        keys.append(cache_keys.super_admin_audit_total(tenant_id))
    await cache_delete(*keys)


async def bust_platform_dashboard_cache(tenant_id: str | None = None) -> None:
    """
    Call after any create/delete that changes platform or tenant user/student counts.
    Clears super-admin Redis keys and per-tenant admin stats cache.
    """
    await invalidate_super_admin_cache(tenant_id)
    if tenant_id:
        await cache_delete(cache_keys.admin_stats(str(tenant_id)))
        try:
            from app.core.cache_service import invalidate_public_tenant
            from app.db.supabase import get_admin_client

            row = (
                get_admin_client()
                .table("tenants")
                .select("slug")
                .eq("id", str(tenant_id))
                .maybe_single()
                .execute()
            )
            if row and row.data and row.data.get("slug"):
                await invalidate_public_tenant(str(row.data["slug"]))
        except Exception:
            _logger.exception("bust_platform_dashboard_cache public tenant slug failed")


async def fetch_platform_stats() -> tuple[dict[str, int], bool]:
    async def _load() -> dict[str, int]:
        return await _fetch_platform_stats_uncached()

    return await get_or_set_cache(
        cache_keys.super_admin_stats(),
        cache_ttl.SUPER_ADMIN,
        _load,
    )


async def _fetch_platform_stats_uncached() -> dict[str, int]:
    admin = get_admin_client()

    def _tenant_count(*, active_only: bool = False) -> int:
        q = admin.table("tenants").select("id", count="exact").eq("is_platform_tenant", False)
        if active_only:
            q = q.eq("is_active", True)
        return _count_result(
            _execute_with_retry(
                q.order("created_at", desc=True).limit(1),
                label="stats/tenant_count",
            )
        )

    def _role_count(role: str) -> int:
        return _count_result(
            _execute_with_retry(
                admin.table("users").select("id", count="exact").eq("role", role),
                label=f"stats/role_count/{role}",
            )
        )

    def _student_count() -> int:
        return _count_result(
            _execute_with_retry(
                admin.table("students").select("id", count="exact"),
                label="stats/student_count",
            )
        )

    (
        total_tenants,
        active_tenants,
        total_admins,
        total_teachers,
        total_students,
    ) = await asyncio.gather(
        asyncio.to_thread(_tenant_count),
        asyncio.to_thread(lambda: _tenant_count(active_only=True)),
        asyncio.to_thread(lambda: _role_count("admin")),
        asyncio.to_thread(lambda: _role_count("teacher")),
        asyncio.to_thread(_student_count),
    )

    return {
        "total_tenants": total_tenants,
        "active_tenants": active_tenants,
        "total_admins": total_admins,
        "total_teachers": total_teachers,
        "total_students": total_students,
    }


async def fetch_tenants_with_counts() -> tuple[list[dict[str, Any]], bool]:
    async def _load() -> list[dict[str, Any]]:
        return await _fetch_tenants_with_counts_uncached()

    return await get_or_set_cache(
        cache_keys.super_admin_tenants(),
        cache_ttl.SUPER_ADMIN,
        _load,
    )


async def _fetch_tenants_with_counts_uncached() -> list[dict[str, Any]]:
    admin = get_admin_client()

    def _load_tenants() -> list[dict[str, Any]]:
        res = _execute_with_retry(
            admin.table("tenants")
            .select("*")
            .eq("is_platform_tenant", False)
            .order("created_at", desc=True),
            label="tenants/load_tenants",
        )
        return list(res.data or [])

    def _load_user_roles() -> list[dict[str, Any]]:
        res = _execute_with_retry(
            admin.table("users")
            .select("tenant_id, role")
            .in_("role", ["admin", "teacher"]),
            label="tenants/load_user_roles",
        )
        return list(res.data or [])

    def _load_student_tenants() -> list[dict[str, Any]]:
        res = _execute_with_retry(
            admin.table("students").select("tenant_id"),
            label="tenants/load_student_tenants",
        )
        return list(res.data or [])

    tenants, user_rows, student_rows = await asyncio.gather(
        asyncio.to_thread(_load_tenants),
        asyncio.to_thread(_load_user_roles),
        asyncio.to_thread(_load_student_tenants),
    )

    admin_counts: dict[str, int] = defaultdict(int)
    teacher_counts: dict[str, int] = defaultdict(int)
    for row in user_rows:
        tid = row.get("tenant_id")
        if not tid:
            continue
        role = row.get("role")
        if role == "admin":
            admin_counts[str(tid)] += 1
        elif role == "teacher":
            teacher_counts[str(tid)] += 1

    student_counts: dict[str, int] = defaultdict(int)
    for row in student_rows:
        tid = row.get("tenant_id")
        if tid:
            student_counts[str(tid)] += 1

    enriched: list[dict[str, Any]] = []
    for tenant in tenants:
        tid = str(tenant["id"])
        enriched.append(
            {
                **tenant,
                "admin_count": admin_counts.get(tid, 0),
                "teacher_count": teacher_counts.get(tid, 0),
                "student_count": student_counts.get(tid, 0),
            }
        )

    return enriched


def fetch_tenant_teachers_enriched(tenant_id: str) -> list[dict[str, Any]]:
    """Teachers for one tenant with class_count and student_count (3 queries total)."""
    admin = get_admin_client()
    res = _execute_with_retry(
        admin.table("users")
        .select(
            "id, name, email, is_active, is_registered, deactivated_at, created_at"
        )
        .eq("tenant_id", str(tenant_id))
        .eq("role", "teacher")
        .order("created_at", desc=True),
        label="tenant_teachers/list",
    )
    teachers = list(res.data or [])
    if not teachers:
        return []

    teacher_ids = [str(t["id"]) for t in teachers]
    classes_res = _execute_with_retry(
        admin.table("classes")
        .select("id, teacher_id")
        .eq("tenant_id", str(tenant_id))
        .in_("teacher_id", teacher_ids),
        label="tenant_teachers/classes",
    )
    class_ids_by_teacher: dict[str, list[str]] = defaultdict(list)
    all_class_ids: list[str] = []
    for row in classes_res.data or []:
        tid = str(row["teacher_id"])
        cid = str(row["id"])
        class_ids_by_teacher.setdefault(tid, []).append(cid)
        all_class_ids.append(cid)

    enroll_count_by_class: dict[str, int] = defaultdict(int)
    if all_class_ids:
        from app.db.batch_in import chunked_in_fetch

        enroll_rows = chunked_in_fetch(
            admin,
            "class_enrollments",
            "class_id",
            "class_id",
            all_class_ids,
            label="tenant_teachers/enrollments",
        )
        for row in enroll_rows:
            enroll_count_by_class[str(row["class_id"])] += 1

    enriched: list[dict[str, Any]] = []
    for t in teachers:
        tid = str(t["id"])
        cids = class_ids_by_teacher.get(tid, [])
        enriched.append(
            {
                **t,
                "class_count": len(cids),
                "student_count": sum(enroll_count_by_class.get(cid, 0) for cid in cids),
            }
        )
    return enriched


def fetch_tenant_students_enriched(tenant_id: str) -> list[dict[str, Any]]:
    """Students for one tenant with first class/teacher (2 queries total)."""
    admin = get_admin_client()
    students_res = _execute_with_retry(
        admin.table("students")
        .select("id, user_id, name, phone, deactivated_at, created_at")
        .eq("tenant_id", str(tenant_id))
        .order("created_at", desc=True),
        label="tenant_students/list",
    )
    students = list(students_res.data or [])
    if not students:
        return []

    student_ids = [str(s["id"]) for s in students]
    from app.db.batch_in import chunked_in_fetch

    enroll_rows = chunked_in_fetch(
        admin,
        "class_enrollments",
        "student_id, classes(id, name, teacher_id, users(name))",
        "student_id",
        student_ids,
        label="tenant_students/enrollments",
    )
    first_enrollment: dict[str, dict] = {}
    for row in enroll_rows:
        sid = str(row["student_id"])
        if sid not in first_enrollment:
            first_enrollment[sid] = row

    enriched: list[dict[str, Any]] = []
    for s in students:
        sid = str(s["id"])
        class_name = None
        teacher_name = None
        enr = first_enrollment.get(sid)
        if enr:
            cls = enr.get("classes") or {}
            if isinstance(cls, list):
                cls = cls[0] if cls else {}
            if cls:
                class_name = cls.get("name")
                teacher_row = cls.get("users") or {}
                if isinstance(teacher_row, list):
                    teacher_row = teacher_row[0] if teacher_row else {}
                teacher_name = (teacher_row or {}).get("name")
        enriched.append(
            {
                **s,
                "is_active": s.get("deactivated_at") is None,
                "class_name": class_name,
                "teacher_name": teacher_name,
                "status": "Inactive" if s.get("deactivated_at") else "Active",
            }
        )
    return enriched
