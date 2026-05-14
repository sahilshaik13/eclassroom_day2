from __future__ import annotations

from typing import Any, Iterable, Optional

KPI_LABELS = {
    "hifz": "Hifz",
    "kubra": "Kubra",
    "sughra": "Sughra",
    "tajweed": "Tajweed",
}

ALL_KPI_BUCKETS = ["hifz", "kubra", "sughra", "tajweed"]

TASK_TYPE_TO_KPI_BUCKET = {
    "memorise": "hifz",
    "review": "kubra",
    "read": "kubra",
    "reflection": "kubra",
    "recite": "sughra",
    "listen": "sughra",
    "mcq": "tajweed",
    "written": "tajweed",
}

_KPI_BUCKET_KEYWORDS = {
    "hifz": (
        "hifz",
        "memorise",
        "memorize",
        "new curriculum",
        "curriculum",
        "pages",
        "page",
        "surah",
        "ayah",
        "juz",
        "juzz",
        "حفظ",
        "المقرر",
        "الجديد",
        "عدد الوجه",
        "عدد الاوجه",
        "عدد الأوجه",
        "جزء",
        "سورة",
        "آية",
    ),
    "kubra": (
        "kubra",
        "review",
        "revision",
        "retention",
        "meaning",
        "tafsir",
        "كبرى",
        "مراجعة",
        "تفسير",
        "معاني",
        "شرح معاني",
    ),
    "sughra": (
        "sughra",
        "recite",
        "recitation",
        "listen",
        "audio",
        "oral",
        "صغرى",
        "تسميع",
        "استماع",
        "شفهي",
        "استظهار",
    ),
    "tajweed": (
        "tajweed",
        "theoretical",
        "theory",
        "explanation",
        "rule",
        "rules",
        "written",
        "قاعدة",
        "تجويد",
        "شرح",
        "نظري",
        "تحريري",
        "احكام",
        "أحكام",
    ),
}

_SCHEDULE_COLUMN_HINTS = (
    "date",
    "day/date",
    "day date",
    "التاريخ",
    "التاريخ الميلادي",
    "schedule date",
    "day",
    "day no",
    "day number",
    "اليوم",
    "رقم اليوم",
)

_SUPPORTING_FIELD_HINTS = {
    "page_count": (
        "number of pages",
        "no. of pages",
        "no of pages",
        "page count",
        "pages count",
        "عدد الصفحات",
        "عدد الاوجه",
        "عدد الأوجه",
    ),
    "interpretation_page": (
        "interpretation curriculum/page",
        "interpretation page",
        "tafsir page",
        "meaning page",
        "lesson page",
        "صفحة التفسير",
        "منهج التفسير",
        "التفسير",
    ),
}


def normalize_kpi_bucket(value: Any) -> Optional[str]:
    raw = str(value or "").strip().lower()
    return raw if raw in ALL_KPI_BUCKETS else None


def is_schedule_metadata_column(column: Any) -> bool:
    value = str(column or "").strip().lower()
    return any(hint in value for hint in _SCHEDULE_COLUMN_HINTS)


def supporting_field_key_for_column(column: Any) -> Optional[str]:
    value = str(column or "").strip().lower()
    for field_key, hints in _SUPPORTING_FIELD_HINTS.items():
        if any(hint in value for hint in hints):
            return field_key
    return None


def is_supporting_metadata_column(column: Any) -> bool:
    return supporting_field_key_for_column(column) is not None


def build_column_bucket_map(
    columns: Iterable[str],
    rows: Optional[list[dict[str, Any]]] = None,
    existing_map: Optional[dict[str, Any]] = None,
) -> dict[str, str]:
    inferred: dict[str, str] = {}
    rows = rows or []
    existing_map = existing_map or {}

    for column in columns:
        if is_schedule_metadata_column(column) or is_supporting_metadata_column(column):
            continue

        normalized = normalize_kpi_bucket(existing_map.get(column))
        if normalized:
            inferred[str(column)] = normalized
            continue

        sample_value = ""
        for row in rows:
            candidate = str((row or {}).get(column, "")).strip()
            if candidate:
                sample_value = candidate
                break
        inferred[str(column)] = infer_kpi_bucket(column, sample_value) or "kubra"

    return inferred


def infer_kpi_bucket(column_name: str, value: str = "", task_type: Optional[str] = None) -> str:
    sample = f"{column_name} {value}".lower()
    for bucket, keywords in _KPI_BUCKET_KEYWORDS.items():
        if any(keyword in sample for keyword in keywords):
            return bucket

    task_type_bucket = normalize_kpi_bucket(TASK_TYPE_TO_KPI_BUCKET.get((task_type or "").strip().lower()))
    return task_type_bucket or "kubra"


def kpi_bucket_for_task(task: dict) -> str:
    cfg = task.get("config") if isinstance(task.get("config"), dict) else {}
    stored = normalize_kpi_bucket(cfg.get("kpi_bucket") if isinstance(cfg, dict) else None)
    if stored:
        return stored

    return infer_kpi_bucket(
        str(task.get("title") or ""),
        str(task.get("description") or ""),
        str(task.get("task_type") or ""),
    )


def hybrid_progress_value(submission: Optional[dict]) -> int:
    if not submission:
        return 0

    status = str(submission.get("status") or "").strip().lower()
    if status == "reviewed":
        score = submission.get("score")
        try:
            return max(0, min(100, int(score if score is not None else 0)))
        except Exception:
            return 0

    if status in {"submitted", "pending"}:
        return 100

    return 100


def empty_bucket_summary() -> dict[str, dict[str, int]]:
    return {
        bucket: {
            "assigned": 0,
            "submitted": 0,
            "reviewed": 0,
            "progress_pct": 0,
        }
        for bucket in ALL_KPI_BUCKETS
    }


def summarize_bucket_progress(task_records: list[dict[str, Any]], student_id: Optional[str] = None) -> dict[str, dict[str, int]]:
    summary = empty_bucket_summary()

    for record in task_records:
        task = record.get("task") if isinstance(record.get("task"), dict) else record
        submission = record.get("submission")

        if submission is None and student_id:
            all_subs = task.get("study_plan_submissions") or []
            submission = next((s for s in all_subs if s.get("student_id") == student_id), None)

        bucket = kpi_bucket_for_task(task)
        row = summary[bucket]
        row["assigned"] += 1
        if submission:
            row["submitted"] += 1
            if str(submission.get("status") or "").strip().lower() == "reviewed":
                row["reviewed"] += 1
        row["progress_pct"] += hybrid_progress_value(submission)

    for bucket in ALL_KPI_BUCKETS:
        assigned = summary[bucket]["assigned"]
        raw = summary[bucket]["progress_pct"]
        summary[bucket]["progress_pct"] = round(raw / assigned) if assigned else 0

    return summary
