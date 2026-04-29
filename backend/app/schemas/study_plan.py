from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict
from datetime import date, datetime
from uuid import UUID
from enum import Enum

class TaskType(str, Enum):
    MEMORISE = "memorise"
    REVIEW = "review"
    RECITE = "recite"
    LISTEN = "listen"
    READ = "read"
    MCQ = "mcq"
    WRITTEN = "written"
    REFLECTION = "reflection"

class PlanStatus(str, Enum):
    TEMPLATE = "template"
    DRAFT = "draft"
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"

class SubmissionStatus(str, Enum):
    PENDING = "pending"
    SUBMITTED = "submitted"
    REVIEWED = "reviewed"
    REJECTED = "rejected"

# ── Task Configuration ────────────────────────────────────────

class MCQOption(BaseModel):
    text: str

class MCQConfig(BaseModel):
    questions: List[Dict[str, Any]] # Each: {question: str, options: [str], correct_option: int}

class MemorizationConfig(BaseModel):
    surah: str
    from_verse: int
    to_verse: int
    instructions: Optional[str] = None

# ── Hierarchical Models ───────────────────────────────────────

class TaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    task_type: TaskType = TaskType.MEMORISE
    required: bool = True
    order_index: int = 0
    config: Dict[str, Any] = {}

class TaskCreate(TaskBase):
    pass

class Task(TaskBase):
    id: UUID
    period_id: UUID
    template_id: Optional[UUID] = None

class PeriodBase(BaseModel):
    title: str
    duration_minutes: int = 30
    order_index: int = 0

class PeriodCreate(PeriodBase):
    pass

class Period(PeriodBase):
    id: UUID
    day_id: UUID
    tasks: List[Task] = []

class DayBase(BaseModel):
    day_number: int
    scheduled_date: Optional[date] = None

class DayCreate(DayBase):
    pass

class Day(DayBase):
    id: UUID
    plan_id: UUID
    periods: List[Period] = []

class StudyPlanBase(BaseModel):
    name: str
    description: Optional[str] = None
    status: PlanStatus = PlanStatus.DRAFT

class StudyPlanCreate(StudyPlanBase):
    class_id: Optional[UUID] = None
    template_id: Optional[UUID] = None

class StudyPlan(StudyPlanBase):
    id: UUID
    tenant_id: UUID
    class_id: Optional[UUID] = None
    template_id: Optional[UUID] = None
    days: List[Day] = []
    created_at: datetime
    updated_at: datetime

# ── Submissions ───────────────────────────────────────────────

class SubmissionCreate(BaseModel):
    content: Dict[str, Any] = {}
    audio_url: Optional[str] = None

class SubmissionReview(BaseModel):
    feedback: Optional[str] = None
    score: Optional[int] = Field(None, ge=0, le=100)
    status: SubmissionStatus = SubmissionStatus.REVIEWED
    responses_override: Optional[List[Dict[str, Any]]] = None

class Submission(BaseModel):
    id: UUID
    student_id: UUID
    task_id: UUID
    status: SubmissionStatus
    content: Dict[str, Any]
    audio_url: Optional[str]
    feedback: Optional[str]
    score: Optional[int]
    reviewed_by: Optional[UUID]
    reviewed_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
