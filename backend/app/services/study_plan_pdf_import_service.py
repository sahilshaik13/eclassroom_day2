from __future__ import annotations

import json
import re
import uuid
from datetime import date, datetime, timedelta
from typing import Any, Iterable, Optional

import httpx

from app.core.config import settings
from app.services.study_plan_kpi_service import (
    build_column_bucket_map,
    infer_kpi_bucket,
    is_supporting_metadata_column,
    normalize_kpi_bucket,
    supporting_field_key_for_column,
)

STUDY_PLAN_PDF_BUCKET = "study-plan-pdfs"
FLAT_PERIOD_TITLE = "__flat_schedule__"

DATE_COLUMN_HINTS = (
    "date",
    "day/date",
    "day date",
    "التاريخ",
    "التاريخ الميلادي",
    "schedule date",
)

DAY_COLUMN_HINTS = (
    "day",
    "day no",
    "day number",
    "اليوم",
    "رقم اليوم",
)


def ensure_nexusocr_configured() -> None:
    if not settings.NEXUSOCR_API_KEY.strip():
        raise ValueError("NEXUSOCR_API_KEY is not configured in backend/.env")


def build_storage_path(tenant_id: str, class_id: str, filename: Optional[str]) -> str:
    safe_name = re.sub(r"[^A-Za-z0-9._-]+", "-", filename or "study-plan.pdf").strip("-") or "study-plan.pdf"
    return f"{tenant_id}/{class_id}/{uuid.uuid4()}-{safe_name}"


def upload_pdf_to_storage(admin: Any, tenant_id: str, class_id: str, filename: str, file_bytes: bytes) -> str:
    storage_path = build_storage_path(tenant_id, class_id, filename)
    admin.storage.from_(STUDY_PLAN_PDF_BUCKET).upload(
        storage_path,
        file_bytes,
        {"content-type": "application/pdf"},
    )
    return storage_path


def create_signed_pdf_url(admin: Any, bucket: str, storage_path: str, expires_in: int = 3600) -> Optional[str]:
    try:
        result = admin.storage.from_(bucket).create_signed_url(storage_path, expires_in)
        if isinstance(result, dict):
            return result.get("signedURL") or result.get("signedUrl") or result.get("signed_url")
    except Exception:
        return None
    return None


def normalize_import_status(status: Any) -> str:
    raw = str(status or "").strip().lower()
    if raw in {"completed", "complete", "done", "success", "succeeded", "ready"}:
        return "completed"
    if raw in {"failed", "error"}:
        return "failed"
    if raw in {"cancelled", "canceled"}:
        return "cancelled"
    if raw in {"uploading"}:
        return "uploading"
    if raw:
        return "processing"
    return "pending"


def _coerce_cell(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return str(value).strip()


def _coerce_row(row: Any) -> dict[str, str]:
    if not isinstance(row, dict):
        return {}
    return {str(key): _coerce_cell(value) for key, value in row.items()}


def extract_columns_and_rows(payload: Any) -> tuple[list[str], list[dict[str, str]]]:
    columns: list[str] = []
    rows_candidate: Any = None

    if isinstance(payload, list):
        rows_candidate = payload
    elif isinstance(payload, dict):
        raw_columns = payload.get("columns")
        if isinstance(raw_columns, list):
            columns = [str(item) for item in raw_columns if str(item).strip()]

        for key in ("rows", "json", "result", "full_json", "filtered_json", "data"):
            candidate = payload.get(key)
            if isinstance(candidate, list):
                rows_candidate = candidate
                break
            if isinstance(candidate, dict):
                for nested_key in ("rows", "json", "result", "data"):
                    nested_candidate = candidate.get(nested_key)
                    if isinstance(nested_candidate, list):
                        rows_candidate = nested_candidate
                        break
                if isinstance(rows_candidate, list):
                    break

        if rows_candidate is None:
            for value in payload.values():
                if isinstance(value, list) and value and isinstance(value[0], dict):
                    rows_candidate = value
                    break

    normalized_rows = [_coerce_row(row) for row in (rows_candidate or []) if isinstance(row, dict)]
    if not columns:
        ordered: list[str] = []
        for row in normalized_rows:
            for key in row.keys():
                if key not in ordered:
                    ordered.append(key)
        columns = ordered
    return columns, normalized_rows


def _hint_match(column: str, hints: Iterable[str]) -> bool:
    value = str(column or "").strip().lower()
    return any(hint in value for hint in hints)


def detect_date_column(columns: list[str]) -> Optional[str]:
    return next((column for column in columns if _hint_match(column, DATE_COLUMN_HINTS)), None)


def detect_day_column(columns: list[str]) -> Optional[str]:
    return next((column for column in columns if _hint_match(column, DAY_COLUMN_HINTS)), None)


def parse_scheduled_date(value: Optional[str]) -> Optional[str]:
    raw = (value or "").strip()
    if not raw:
        return None

    formats = (
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%d-%m-%Y",
        "%d.%m.%Y",
        "%m/%d/%Y",
        "%d %b %Y",
        "%d %B %Y",
    )
    for fmt in formats:
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def meaningful_value(value: Optional[str]) -> bool:
    raw = (value or "").strip()
    if not raw:
        return False
    lowered = raw.lower()
    return lowered not in {"-", "n/a", "na", "nil", "none", "no", "لا يوجد", "لايوجد"}


def infer_task_type(column_name: str, value: str) -> str:
    sample = f"{column_name} {value}".lower()
    if any(token in sample for token in ("review", "revision", "major review", "minor review", "مراج")):
        return "review"
    if any(token in sample for token in ("listen", "audio", "استماع")):
        return "listen"
    if any(token in sample for token in ("tajweed", "theoretical", "theory", "explanation", "شرح", "قاعدة")):
        return "written"
    if any(token in sample for token in ("interpretation", "tafsir", "meaning", "تفسير")):
        return "read"
    if any(token in sample for token in ("recite", "recitation", "تسميع", "قراءة")):
        return "recite"
    return "memorise"


def build_plan_rows(
    selected_columns: list[str],
    rows: list[dict[str, str]],
    column_bucket_map: Optional[dict[str, Any]] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> list[dict[str, Any]]:
    ordered_columns = [str(column) for column in selected_columns if str(column).strip()]
    if not ordered_columns:
        return []

    date_column = detect_date_column(ordered_columns)
    day_column = detect_day_column(ordered_columns)
    supporting_columns = [column for column in ordered_columns if is_supporting_metadata_column(column)]
    content_columns = [
        column for column in ordered_columns
        if column not in {date_column, day_column} and column not in supporting_columns
    ]
    plan_days: list[dict[str, Any]] = []
    normalized_bucket_map = {
        str(key): normalize_kpi_bucket(value) or infer_kpi_bucket(str(key))
        for key, value in (column_bucket_map or {}).items()
    }

    for row_index, original_row in enumerate(rows):
        row = _coerce_row(original_row)
        if not any(meaningful_value(row.get(column)) for column in ordered_columns):
            continue

        tasks: list[dict[str, Any]] = []
        for task_index, column in enumerate(content_columns):
            cell_value = row.get(column, "")
            if not meaningful_value(cell_value):
                continue

            tasks.append(
                {
                    "title": f"{column}: {cell_value}",
                    "description": None,
                    "task_type": infer_task_type(column, cell_value),
                    "required": True,
                    "order_index": task_index,
                    "config": {
                        "kpi_bucket": normalized_bucket_map.get(column) or infer_kpi_bucket(column, cell_value),
                        "source_column": column,
                        "source_value": cell_value,
                        "source_row": row,
                    },
                }
            )

        if not tasks:
            continue

        supporting_fields: dict[str, dict[str, str]] = {}
        for column in supporting_columns:
            cell_value = row.get(column, "")
            if not meaningful_value(cell_value):
                continue
            field_key = supporting_field_key_for_column(column)
            if not field_key:
                continue
            supporting_fields[field_key] = {"column": column, "value": cell_value}

        if supporting_fields:
            for field_key, field_payload in supporting_fields.items():
                attached = False
                for task in tasks:
                    config = task.get("config") or {}
                    bucket = config.get("kpi_bucket")
                    source_column = str(config.get("source_column") or "").lower()
                    if field_key == "page_count" and bucket == "hifz":
                        config[field_key] = field_payload["value"]
                        config.setdefault("supporting_fields", {})[field_key] = field_payload
                        attached = True
                        break
                    if field_key == "interpretation_page" and bucket == "kubra" and any(
                        token in source_column for token in ("interpret", "tafsir", "meaning", "تفسير")
                    ):
                        config[field_key] = field_payload["value"]
                        config.setdefault("supporting_fields", {})[field_key] = field_payload
                        attached = True
                        break

                if not attached:
                    for task in tasks:
                        config = task.get("config") or {}
                        bucket = config.get("kpi_bucket")
                        if field_key == "page_count" and bucket == "hifz":
                            config[field_key] = field_payload["value"]
                            config.setdefault("supporting_fields", {})[field_key] = field_payload
                            attached = True
                            break
                        if field_key == "interpretation_page" and bucket == "kubra":
                            config[field_key] = field_payload["value"]
                            config.setdefault("supporting_fields", {})[field_key] = field_payload
                            attached = True
                            break

        plan_days.append(
            {
                "day_number": len(plan_days) + 1,
                "scheduled_date": parse_scheduled_date(row.get(date_column)) if date_column else None,
                "is_accessible": True,
                "periods": [
                    {
                        "title": FLAT_PERIOD_TITLE,
                        "duration_minutes": max(30, min(180, len(tasks) * 15)),
                        "order_index": 0,
                        "tasks": tasks,
                    }
                ],
                "source_row": row,
                "source_label": row.get(day_column) if day_column else None,
                "supporting_fields": supporting_fields,
            }
        )
    if start_date:
        if end_date and ((end_date - start_date).days + 1) < len(plan_days):
            raise ValueError("Selected date range is shorter than the number of imported study-plan days")

        for index, day_payload in enumerate(plan_days):
            day_payload["scheduled_date"] = (start_date + timedelta(days=index)).isoformat()

    return plan_days


def build_import_payload(import_row: dict[str, Any], admin: Any, include_pdf_url: bool = True) -> dict[str, Any]:
    payload = dict(import_row or {})
    bucket_columns = payload.get("selected_columns") or payload.get("detected_columns") or []
    bucket_rows = payload.get("filtered_rows") or payload.get("extracted_rows") or []
    payload["column_bucket_map"] = build_column_bucket_map(
        bucket_columns,
        bucket_rows,
        payload.get("column_bucket_map") or {},
    )
    if include_pdf_url and payload.get("pdf_storage_path"):
        payload["pdf_url"] = create_signed_pdf_url(
            admin,
            payload.get("pdf_bucket") or STUDY_PLAN_PDF_BUCKET,
            payload["pdf_storage_path"],
        )
    return payload


async def upload_pdf_to_provider(file_bytes: bytes, filename: str) -> dict[str, Any]:
    ensure_nexusocr_configured()
    async with httpx.AsyncClient(base_url=settings.NEXUSOCR_API_URL, timeout=settings.NEXUSOCR_TIMEOUT_SECONDS) as client:
        response = await client.post(
            "/api/upload",
            headers={"X-API-Key": settings.NEXUSOCR_API_KEY},
            files={"file": (filename, file_bytes, "application/pdf")},
        )
        response.raise_for_status()
        return response.json()


async def fetch_provider_job(job_id: str) -> dict[str, Any]:
    ensure_nexusocr_configured()
    async with httpx.AsyncClient(base_url=settings.NEXUSOCR_API_URL, timeout=settings.NEXUSOCR_TIMEOUT_SECONDS) as client:
        response = await client.get(
            f"/api/jobs/{job_id}",
            headers={"X-API-Key": settings.NEXUSOCR_API_KEY},
        )
        response.raise_for_status()
        return response.json()


async def fetch_provider_result(job_id: str) -> dict[str, Any]:
    ensure_nexusocr_configured()
    async with httpx.AsyncClient(base_url=settings.NEXUSOCR_API_URL, timeout=settings.NEXUSOCR_TIMEOUT_SECONDS) as client:
        response = await client.get(
            f"/api/jobs/{job_id}/result",
            headers={"X-API-Key": settings.NEXUSOCR_API_KEY},
        )
        response.raise_for_status()
        return response.json()


async def fetch_filtered_provider_result(job_id: str, selected_columns: list[str]) -> dict[str, Any]:
    ensure_nexusocr_configured()
    async with httpx.AsyncClient(base_url=settings.NEXUSOCR_API_URL, timeout=settings.NEXUSOCR_TIMEOUT_SECONDS) as client:
        response = await client.post(
            f"/api/jobs/{job_id}/filtered",
            headers={"X-API-Key": settings.NEXUSOCR_API_KEY},
            json={"selected_columns": selected_columns},
        )
        response.raise_for_status()
        return response.json()


async def cancel_provider_job(job_id: str) -> dict[str, Any]:
    ensure_nexusocr_configured()
    async with httpx.AsyncClient(base_url=settings.NEXUSOCR_API_URL, timeout=settings.NEXUSOCR_TIMEOUT_SECONDS) as client:
        response = await client.post(
            f"/api/jobs/{job_id}/cancel",
            headers={"X-API-Key": settings.NEXUSOCR_API_KEY},
        )
        response.raise_for_status()
        return response.json()


async def retry_provider_job(job_id: str) -> dict[str, Any]:
    ensure_nexusocr_configured()
    async with httpx.AsyncClient(base_url=settings.NEXUSOCR_API_URL, timeout=settings.NEXUSOCR_TIMEOUT_SECONDS) as client:
        response = await client.post(
            f"/api/jobs/{job_id}/retry",
            headers={"X-API-Key": settings.NEXUSOCR_API_KEY},
        )
        response.raise_for_status()
        return response.json()


async def sync_import_status(admin: Any, import_row: dict[str, Any]) -> dict[str, Any]:
    job_id = import_row.get("ocr_job_id")
    if not job_id:
        return import_row

    status_payload = await fetch_provider_job(job_id)
    normalized_status = normalize_import_status(status_payload.get("status"))
    update_data: dict[str, Any] = {
        "ocr_status": normalized_status,
        "total_chunks": status_payload.get("total_chunks") or status_payload.get("total") or 0,
        "completed_chunks": status_payload.get("completed_chunks") or status_payload.get("completed") or 0,
        "failed_chunks": status_payload.get("failed_chunks") or status_payload.get("failed") or 0,
        "parse_message": status_payload.get("message") or status_payload.get("detail") or status_payload.get("error"),
        "latest_payload": status_payload,
    }

    if normalized_status == "completed":
        result_payload = await fetch_provider_result(job_id)
        columns, rows = extract_columns_and_rows(result_payload)
        existing_bucket_map = import_row.get("column_bucket_map") or {}
        update_data["detected_columns"] = columns
        update_data["extracted_rows"] = rows
        update_data["column_bucket_map"] = build_column_bucket_map(columns, rows, existing_bucket_map)
        if not import_row.get("selected_columns"):
            update_data["selected_columns"] = columns
        if not import_row.get("filtered_rows"):
            update_data["filtered_rows"] = rows
        update_data["latest_payload"] = result_payload

    result = (
        admin.table("study_plan_pdf_imports")
        .update(update_data)
        .eq("id", import_row["id"])
        .execute()
    )
    return result.data[0] if result.data else {**import_row, **update_data}
