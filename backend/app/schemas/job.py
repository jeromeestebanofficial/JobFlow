from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class JobOut(BaseModel):
    id: int
    external_id: Optional[str]
    source: Optional[str]
    title: str
    company: Optional[str]
    location: Optional[str]
    is_remote: bool
    job_type: Optional[str]
    salary_min: Optional[int]
    salary_max: Optional[int]
    salary_currency: Optional[str]
    description: Optional[str]
    url: Optional[str]
    apply_url: Optional[str]
    logo_url: Optional[str]
    tags: Optional[list]
    posted_at: Optional[datetime]
    match_score: Optional[float] = None

    class Config:
        from_attributes = True


class JobSearchParams(BaseModel):
    query: Optional[str] = None
    location: Optional[str] = None
    remote_only: Optional[bool] = False
    job_type: Optional[str] = None
    min_salary: Optional[int] = None
    tags: Optional[List[str]] = None
    source: Optional[str] = None
    page: int = 1
    per_page: int = 20


class JobMatchRequest(BaseModel):
    job_id: int
    resume_id: Optional[int] = None
