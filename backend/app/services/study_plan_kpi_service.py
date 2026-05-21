from __future__ import annotations

from datetime import date
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

_PAGE_COUNT_EXACT_COLUMNS = frozenset(
    {
        "pages",
        "page",
        "# pages",
        "total pages",
        "pages to complete",
        "required pages",
    }
)

_SUPPORTING_FIELD_HINTS = {
    "page_count": (
        "number of pages",
        "no. of pages",
        "no of pages",
        "page count",
        "pages count",
        "pages to complete",
        "required pages",
        "total pages",
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
    if value in _PAGE_COUNT_EXACT_COLUMNS:
        return "page_count"
    for field_key, hints in _SUPPORTING_FIELD_HINTS.items():
        if any(hint in value for hint in hints):
            return field_key
    return None


def is_student_day_released(scheduled_date: Any, *, today: Optional[str] = None) -> bool:
    """True when a plan day is today or in the past (student may view/submit)."""
    if not scheduled_date:
        return True
    today_key = today or date.today().isoformat()
    return str(scheduled_date)[:10] <= today_key


def filter_student_visible_days(days: list[dict]) -> list[dict]:
    """Drop future scheduled days from student-facing study plan payloads."""
    today = date.today().isoformat()
    visible: list[dict] = []
    for day in days:
        scheduled = day.get("scheduled_date")
        if scheduled and str(scheduled)[:10] > today:
            continue
        visible.append(day)
    return visible


def is_tracker_task(task: dict) -> bool:
    """Non-submittable metadata (e.g. number of pages = daily page target)."""
    if is_day_topic_task(task):
        return False
    config = task.get("config") if isinstance(task.get("config"), dict) else {}
    # Only check explicit role flag - be conservative to avoid filtering real tasks
    if config.get("role") == "tracker":
        return True
    # Check Arabic page count titles explicitly
    title = str(task.get("title") or "")
    if "عدد الأوجه" in title or "عدد الاوجه" in title:
        return True
    return False


def page_target_from_day(day: dict) -> Optional[str]:
    """Pages-to-complete tracker value for a plan day (from config or legacy tracker tasks)."""
    for period in day.get("periods") or []:
        for task in period.get("tasks") or []:
            config = task.get("config") if isinstance(task.get("config"), dict) else {}
            if config.get("page_count"):
                return str(config["page_count"]).strip()
            supporting = config.get("supporting_fields")
            if isinstance(supporting, dict):
                page_field = supporting.get("page_count")
                if isinstance(page_field, dict) and page_field.get("value"):
                    return str(page_field["value"]).strip()
    for period in day.get("periods") or []:
        for task in period.get("tasks") or []:
            if not is_tracker_task(task):
                continue
            title = str(task.get("title") or "")
            if ":" in title:
                value = title.split(":", 1)[1].strip()
                if value:
                    return value
            config = task.get("config") if isinstance(task.get("config"), dict) else {}
            if config.get("source_value"):
                return str(config["source_value"]).strip()
    return None


def filter_submittable_tasks(day: dict) -> None:
    """Strip tracker/topic metadata from student task lists; set day.page_target and day.topic."""
    day["page_target"] = page_target_from_day(day)
    day["topic"] = day_topic_from_day(day)
    for period in day.get("periods") or []:
        period["tasks"] = [
            t
            for t in (period.get("tasks") or [])
            if not is_tracker_task(t) and not is_day_topic_task(t)
        ]


def is_supporting_metadata_column(column: Any) -> bool:
    return supporting_field_key_for_column(column) is not None


def is_day_topic_column(column: Any) -> bool:
    """Spreadsheet column that holds the day's lesson topic (e.g. theoretical tajweed), not a tracker."""
    value = str(column or "").strip().lower()
    if not value or is_schedule_metadata_column(column) or is_supporting_metadata_column(column):
        return False
    if "tajweed" in value and any(
        token in value for token in ("theoretical", "theory", "explanation", "شرح", "نظري", "قاعدة")
    ):
        return True
    return any(
        token in value
        for token in (
            "theoretical tajweed",
            "tajweed explanation",
            "theoretical tajweed explanation",
            "شرح التجويد",
            "تجويد نظري",
        )
    )


def is_day_topic_task(task: dict) -> bool:
    config = task.get("config") if isinstance(task.get("config"), dict) else {}
    if config.get("role") == "day_topic":
        return True
    source_column = str(config.get("source_column") or "")
    if is_day_topic_column(source_column):
        return True
    title = str(task.get("title") or "")
    if ":" in title:
        prefix = title.split(":", 1)[0].strip()
        if is_day_topic_column(prefix):
            return True
    return is_day_topic_column(title)


def day_topic_label_from_task(task: dict) -> Optional[str]:
    config = task.get("config") if isinstance(task.get("config"), dict) else {}
    source_column = str(config.get("source_column") or "").strip()
    source_value = str(config.get("source_value") or "").strip()
    if source_value and source_value.lower() not in {source_column.lower()}:
        return source_value

    title = str(task.get("title") or "").strip()
    if ":" in title:
        prefix, value = title.split(":", 1)
        prefix = prefix.strip()
        value = value.strip()
        if value and value.lower() != prefix.lower():
            return value
        return prefix or None
    return title or None


def day_topic_from_day(day: dict) -> Optional[str]:
    stored = str(day.get("topic") or "").strip()
    if stored:
        return stored
    for period in day.get("periods") or []:
        for task in period.get("tasks") or []:
            if is_day_topic_task(task):
                label = day_topic_label_from_task(task)
                if label:
                    return label
    return None


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


def _bucket_from_submission(submission: Optional[dict]) -> Optional[str]:
    if not submission:
        return None
    content = submission.get("content") if isinstance(submission.get("content"), dict) else {}
    meta = content.get("submission_meta") if isinstance(content, dict) else {}
    if isinstance(meta, dict):
        return normalize_kpi_bucket(meta.get("kpi_bucket"))
    return None


def hybrid_progress_value(submission: Optional[dict], *, bucket: Optional[str] = None) -> int:
    if not submission:
        return 0

    normalized_bucket = normalize_kpi_bucket(bucket) or _bucket_from_submission(submission)
    status = str(submission.get("status") or "").strip().lower()
    if status == "reviewed":
        score = submission.get("score")
        try:
            return max(0, min(100, int(score if score is not None else 0)))
        except Exception:
            return 0

    if status in {"submitted", "pending"}:
        # Hifz/Kubra depend on teacher evaluation of audio submissions.
        if normalized_bucket in {"hifz", "kubra"}:
            return 0
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
        row["progress_pct"] += hybrid_progress_value(submission, bucket=bucket)

    for bucket in ALL_KPI_BUCKETS:
        assigned = summary[bucket]["assigned"]
        raw = summary[bucket]["progress_pct"]
        summary[bucket]["progress_pct"] = round(raw / assigned) if assigned else 0

    return summary
