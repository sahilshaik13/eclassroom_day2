"""Persist snapshots of rejected applications and deleted tenant records."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from app.db.supabase import get_admin_client

logger = logging.getLogger(__name__)

EntityType = str
ArchiveReason = str


class DataArchiveService:
    @staticmethod
    def is_table_available() -> bool:
        try:
            admin = get_admin_client()
            admin.table("data_archives").select("id").limit(1).execute()
            return True
        except Exception as exc:
            logger.warning("data_archives table unavailable: %s", exc)
            return False

    @staticmethod
    def archive(
        *,
        tenant_id: str,
        entity_type: EntityType,
        entity_id: Optional[str],
        archive_reason: ArchiveReason,
        payload: dict[str, Any],
        archived_by: Optional[str] = None,
    ) -> Optional[str]:
        row = {
            "tenant_id": tenant_id,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "archive_reason": archive_reason,
            "archived_by": archived_by,
            "archived_at": datetime.now(timezone.utc).isoformat(),
            "payload": payload,
        }
        try:
            admin = get_admin_client()
            res = admin.table("data_archives").insert(row).execute()
            if res.data:
                return str(res.data[0]["id"])
        except Exception as exc:
            logger.warning(
                "Failed to archive %s %s (%s): %s",
                entity_type,
                entity_id,
                archive_reason,
                exc,
            )
        return None

    @staticmethod
    def archive_teacher_application(
        app: dict[str, Any],
        *,
        tenant_id: str,
        archived_by: Optional[str],
    ) -> Optional[str]:
        return DataArchiveService.archive(
            tenant_id=tenant_id,
            entity_type="teacher_application",
            entity_id=str(app.get("id") or ""),
            archive_reason="rejected",
            archived_by=archived_by,
            payload={"application": app},
        )

    @staticmethod
    def archive_student_application(
        app: dict[str, Any],
        *,
        tenant_id: str,
        archived_by: Optional[str],
    ) -> Optional[str]:
        return DataArchiveService.archive(
            tenant_id=tenant_id,
            entity_type="student_application",
            entity_id=str(app.get("id") or ""),
            archive_reason="rejected",
            archived_by=archived_by,
            payload={"application": app},
        )

    @staticmethod
    def archive_student(
        *,
        tenant_id: str,
        student: dict[str, Any],
        user: Optional[dict[str, Any]],
        enrollments: list[dict[str, Any]],
        archived_by: Optional[str],
    ) -> Optional[str]:
        return DataArchiveService.archive(
            tenant_id=tenant_id,
            entity_type="student",
            entity_id=str(student.get("id") or ""),
            archive_reason="deleted",
            archived_by=archived_by,
            payload={
                "student": student,
                "user": user,
                "enrollments": enrollments,
            },
        )

    @staticmethod
    def archive_teacher(
        *,
        tenant_id: str,
        teacher: dict[str, Any],
        classes: list[dict[str, Any]],
        archived_by: Optional[str],
    ) -> Optional[str]:
        return DataArchiveService.archive(
            tenant_id=tenant_id,
            entity_type="teacher",
            entity_id=str(teacher.get("id") or ""),
            archive_reason="deleted",
            archived_by=archived_by,
            payload={
                "teacher": teacher,
                "classes": classes,
            },
        )

    @staticmethod
    def archive_competition(
        *,
        tenant_id: str,
        competition: dict[str, Any],
        registrations: list[dict[str, Any]],
        graders: list[dict[str, Any]],
        setup_teachers: list[dict[str, Any]],
        archived_by: Optional[str],
    ) -> Optional[str]:
        return DataArchiveService.archive(
            tenant_id=tenant_id,
            entity_type="competition",
            entity_id=str(competition.get("id") or ""),
            archive_reason="deleted",
            archived_by=archived_by,
            payload={
                "competition": competition,
                "registrations": registrations,
                "graders": graders,
                "setup_teachers": setup_teachers,
            },
        )
