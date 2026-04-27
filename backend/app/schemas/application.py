from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.schemas.job import JobOut


class ApplicationCreate(BaseModel):
    job_id: int
    resume_id: Optional[int] = None
    cover_letter: Optional[str] = None
    notes: Optional[str] = None


class ApplicationUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None
    cover_letter: Optional[str] = None


class ApplicationOut(BaseModel):
    id: int
    status: str
    match_score: Optional[float]
    cover_letter: Optional[str]
    notes: Optional[str]
    is_auto_applied: bool
    auto_apply_status: Optional[str] = None
    auto_apply_task_id: Optional[str] = None
    auto_apply_error: Optional[str] = None
    applied_at: Optional[datetime]
    created_at: datetime
    job: JobOut

    class Config:
        from_attributes = True


class SwipeAction(BaseModel):
    job_id: int
    action: str     # "right" (apply) | "left" (skip)
    resume_id: Optional[int] = None


class TailorRequest(BaseModel):
    job_id: int
    resume_id: Optional[int] = None


class TailorExportRequest(BaseModel):
    """Generate PDFs from already-tailored content (no AI call)."""

    tailored_resume: dict
    cover_letter: str
    resume_template_id: int
    cover_template_id: int
    job_title: Optional[str] = None
    company: Optional[str] = None


class TailorDraftSaveRequest(BaseModel):
    job_id: int
    resume_id: Optional[int] = None
    tailored_resume: dict
    cover_letter: str
    resume_style: Optional[str] = None
