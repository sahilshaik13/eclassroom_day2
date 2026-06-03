"""ARQ background tasks — OCR, MV refresh, cache rewarm, day unlock."""
from __future__ import annotations

import asyncio
import logging
from datetime import date
from typing import Any, Optional

from app.core import cache_keys, cache_ttl
from app.core.cache_service import cache_set
from app.db.supabase import get_admin_client
from app.services.study_plan_cache_service import (
    _SENTINEL_NO_PLAN,
    load_classroom_study_plan,
    load_study_plan_source,
)
from app.services.audit_log_service import rotate_audit_logs as rotate_audit_logs_async
from app.services.database_keepalive_service import run_database_keepalive
from app.services.import_events import publish_import_event
from app.services.study_plan_pdf_import_service import (
    STUDY_PLAN_PDF_BUCKET,
    build_import_payload,
    normalize_import_status,
    sync_import_status,
    upload_pdf_to_provider,
)
from app.services.study_plan_import_apply_service import apply_import_to_classroom

_logger = logging.getLogger(__name__)

_TERMINAL = frozenset({"completed", "failed", "cancelled", "applied", "archived"})


def _load_import(admin: Any, import_id: str) -> Optional[dict]:
    res = admin.table("study_plan_pdf_imports").select("*").eq("id", import_id).limit(1).execute()
    rows = res.data or []
    return rows[0] if rows else None


async def process_study_plan_upload(ctx: dict, import_id: str) -> None:
    """Upload PDF bytes to NexusOCR and start polling."""
    admin = get_admin_client()
    import_row = _load_import(admin, import_id)
    if not import_row:
        _logger.warning("process_study_plan_upload: import %s not found", import_id)
        return

    class_id = str(import_row.get("class_id") or "")
    bucket = import_row.get("pdf_bucket") or STUDY_PLAN_PDF_BUCKET
    storage_path = import_row.get("pdf_storage_path")
    filename = import_row.get("original_filename") or "study-plan.pdf"

    if not storage_path:
        admin.table("study_plan_pdf_imports").update(
            {"ocr_status": "failed", "parse_message": "Missing storage path"}
        ).eq("id", import_id).execute()
        await publish_import_event(class_id, import_id=import_id, ocr_status="failed")
        return

    try:
        file_bytes = admin.storage.from_(bucket).download(storage_path)
        if not file_bytes:
            raise ValueError("Could not download PDF from storage")

        admin.table("study_plan_pdf_imports").update({"ocr_status": "processing"}).eq("id", import_id).execute()
        await publish_import_event(class_id, import_id=import_id, ocr_status="processing")

        provider_payload = await upload_pdf_to_provider(file_bytes, filename)
        job_id = (
            provider_payload.get("job_id")
            or provider_payload.get("id")
            or (provider_payload.get("job") or {}).get("id")
        )
        if not job_id:
            admin.table("study_plan_pdf_imports").update(
                {
                    "ocr_status": "failed",
                    "parse_message": "NexusOCR did not return a job id",
                    "latest_payload": provider_payload,
                }
            ).eq("id", import_id).execute()
            await publish_import_event(class_id, import_id=import_id, ocr_status="failed")
            return

        updated = (
            admin.table("study_plan_pdf_imports")
            .update(
                {
                    "ocr_job_id": job_id,
                    "ocr_status": normalize_import_status(provider_payload.get("status")),
                    "latest_payload": provider_payload,
                }
            )
            .eq("id", import_id)
            .execute()
        )
        row = updated.data[0] if updated.data else import_row
        payload = build_import_payload(row, admin)
        await publish_import_event(
            class_id,
            import_id=import_id,
            ocr_status=row.get("ocr_status"),
            payload=payload,
        )

        redis = ctx.get("redis")
        if redis:
            await redis.enqueue_job("poll_study_plan_import", import_id, _defer_by=3)
        else:
            asyncio.create_task(_inline_poll_loop(import_id))
    except Exception as exc:
        _logger.exception("process_study_plan_upload failed for %s", import_id)
        admin.table("study_plan_pdf_imports").update(
            {"ocr_status": "failed", "parse_message": str(exc)}
        ).eq("id", import_id).execute()
        await publish_import_event(class_id, import_id=import_id, ocr_status="failed")


async def poll_study_plan_import(ctx: dict, import_id: str) -> None:
    """Poll NexusOCR until terminal status; re-enqueue while processing."""
    admin = get_admin_client()
    import_row = _load_import(admin, import_id)
    if not import_row:
        return

    class_id = str(import_row.get("class_id") or "")
    if not import_row.get("ocr_job_id"):
        return

    status = str(import_row.get("ocr_status") or "")
    if status in _TERMINAL:
        return

    tenant_id = str(import_row.get("tenant_id") or "")
    if class_id and tenant_id:
        active = (
            admin.table("study_plans")
            .select("id")
            .eq("tenant_id", tenant_id)
            .eq("class_id", class_id)
            .neq("status", "archived")
            .limit(1)
            .execute()
        )
        if status == "applied" and not (active.data or []):
            admin.table("study_plan_pdf_imports").update(
                {
                    "ocr_status": "archived",
                    "applied_plan_id": None,
                    "ocr_job_id": None,
                    "parse_message": "Study plan removed from class and moved to archive",
                }
            ).eq("id", import_id).execute()
            await publish_import_event(class_id, import_id=import_id, ocr_status="archived")
            return

    try:
        import_row = await sync_import_status(admin, import_row)
    except Exception as exc:
        _logger.exception("poll_study_plan_import sync failed for %s", import_id)
        admin.table("study_plan_pdf_imports").update(
            {"ocr_status": "failed", "parse_message": str(exc)}
        ).eq("id", import_id).execute()
        await publish_import_event(class_id, import_id=import_id, ocr_status="failed")
        return

    payload = build_import_payload(import_row, admin)
    ocr_status = str(import_row.get("ocr_status") or "")
    await publish_import_event(
        class_id,
        import_id=import_id,
        ocr_status=ocr_status,
        payload=payload,
    )

    redis = ctx.get("redis")
    if ocr_status not in _TERMINAL and redis:
        await redis.enqueue_job("poll_study_plan_import", import_id, _defer_by=4)


async def _inline_poll_loop(import_id: str, max_rounds: int = 90) -> None:
    for _ in range(max_rounds):
        admin = get_admin_client()
        row = _load_import(admin, import_id)
        if not row or str(row.get("ocr_status") or "") in _TERMINAL:
            break
        await poll_study_plan_import({"redis": None}, import_id)
        row = _load_import(admin, import_id)
        if not row or str(row.get("ocr_status") or "") in _TERMINAL:
            break
        await asyncio.sleep(4)


async def apply_study_plan_import_job(
    ctx: dict,
    import_id: str,
    tenant_id: str,
    user_id: str,
    payload: dict,
) -> None:
    """Background apply for heavy study-plan import materialization."""
    admin = get_admin_client()
    import_row = _load_import(admin, import_id)
    class_id = str((import_row or {}).get("class_id") or "")
    try:
        await apply_import_to_classroom(
            import_id=import_id,
            tenant_id=tenant_id,
            user_id=user_id,
            payload=payload or {},
        )
    except Exception as exc:
        _logger.exception("apply_study_plan_import_job failed for import=%s", import_id)
        if import_row:
            admin.table("study_plan_pdf_imports").update(
                {
                    "ocr_status": "failed",
                    "parse_message": f"Background apply failed: {exc}",
                }
            ).eq("id", import_id).execute()
            await publish_import_event(class_id, import_id=import_id, ocr_status="failed")


async def refresh_materialized_views(ctx: dict) -> None:
    """Refresh dashboard MVs (requires migration 035)."""
    admin = get_admin_client()
    try:
        admin.rpc("refresh_materialized_views").execute()
        _logger.info("refresh_materialized_views completed")
    except Exception:
        _logger.exception("refresh_materialized_views failed")


async def rotate_audit_logs_job(ctx: dict) -> None:
    try:
        out = await rotate_audit_logs_async()
        if out and not out.get("skipped"):
            _logger.info("[audit_log] rotate: %s", out)
    except Exception:
        _logger.exception("rotate_audit_logs_job failed")


async def database_keepalive_job(ctx: dict) -> None:
    """Daily ping — keeps Neon + Supabase from long-idle suspension."""
    try:
        await run_database_keepalive()
    except Exception:
        _logger.exception("database_keepalive_job failed")


async def unlock_study_plan_days(ctx: dict) -> None:
    """Open study-plan days whose scheduled_date is today or earlier."""
    admin = get_admin_client()
    today = date.today().isoformat()
    try:
        due = (
            admin.table("study_plan_days")
            .select("id")
            .lte("scheduled_date", today)
            .eq("is_accessible", False)
            .limit(500)
            .execute()
        )
        ids = [r["id"] for r in (due.data or [])]
        if ids:
            admin.table("study_plan_days").update({"is_accessible": True}).in_("id", ids).execute()
            _logger.info("unlock_study_plan_days: opened %s days", len(ids))
    except Exception:
        _logger.exception("unlock_study_plan_days failed")


async def rewarm_hot_caches(ctx: dict) -> None:
    """Preload study-plan payloads for frequently accessed classes."""
    redis = ctx.get("redis")
    if not redis:
        return
    admin = get_admin_client()
    try:
        keys = []
        async for key in redis.scan_iter(match="access:class:*", count=50):
            keys.append(key)
        for key in keys[:20]:
            class_id = str(key).split(":")[-1]
            meta = (
                admin.table("study_plans")
                .select("tenant_id")
                .eq("class_id", class_id)
                .neq("status", "archived")
                .limit(1)
                .execute()
            )
            rows = meta.data or []
            if not rows:
                continue
            tid = str(rows[0].get("tenant_id") or "")
            if not tid:
                continue

            teacher_plan = load_classroom_study_plan(
                admin, tid, class_id, active_only=False
            )
            active_plan = load_classroom_study_plan(
                admin, tid, class_id, active_only=True
            )
            source = load_study_plan_source(admin, tid, class_id)

            if teacher_plan is not None:
                await cache_set(
                    cache_keys.classroom_study_plan(tid, class_id),
                    teacher_plan,
                    cache_ttl.STUDY_PLAN,
                )
            if active_plan is not None:
                await cache_set(
                    cache_keys.classroom_study_plan_active(tid, class_id),
                    active_plan,
                    cache_ttl.STUDY_PLAN,
                )
            else:
                await cache_set(
                    cache_keys.classroom_study_plan_active(tid, class_id),
                    _SENTINEL_NO_PLAN,
                    cache_ttl.STUDY_PLAN,
                )
            if source is not None:
                await cache_set(
                    cache_keys.classroom_study_plan_source(tid, class_id),
                    source,
                    cache_ttl.STUDY_PLAN,
                )
    except Exception:
        _logger.exception("rewarm_hot_caches failed")
