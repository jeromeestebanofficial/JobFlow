from pydantic import BaseModel, EmailStr
from pydantic import ConfigDict
from typing import Optional, Any
from datetime import datetime


class UserRegister(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    full_name: Optional[str] = None
    is_active: bool
    is_admin: bool = False
    created_at: Optional[Any] = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut


class RefreshRequest(BaseModel):
    refresh_token: str


class ApiKeyUpdate(BaseModel):
    provider: str        # openai | anthropic | openrouter
    api_key: str


class PreferencesUpdate(BaseModel):
    job_titles: Optional[list[str]] = None
    locations: Optional[list[str]] = None
    remote_only: Optional[bool] = None
    min_salary: Optional[int] = None
    job_types: Optional[list[str]] = None
    skills: Optional[list[str]] = None
    excluded_companies: Optional[list[str]] = None
    auto_apply_enabled: Optional[bool] = False
    auto_apply_min_score: Optional[int] = 75
    auto_sync_enabled: Optional[bool] = False
    auto_sync_highest_match_only: Optional[bool] = True
    auto_sync_limit: Optional[int] = None
    auto_sync_offset: Optional[int] = None
    auto_sync_location_filter: Optional[str] = None
    auto_sync_description_type: Optional[str] = None
    auto_sync_type_filter: Optional[str] = None
    auto_sync_remote: Optional[str] = None
    auto_sync_description_filter: Optional[str] = None
    auto_sync_organization_filter: Optional[str] = None
    auto_sync_industry_filter: Optional[str] = None
    auto_sync_seniority_filter: Optional[str] = None
    auto_sync_external_apply_url: Optional[str] = None
    auto_sync_ai_work_arrangement_filter: Optional[str] = None
    auto_sync_ai_experience_level_filter: Optional[str] = None
    auto_sync_ai_visa_sponsorship_filter: Optional[str] = None
    auto_sync_order: Optional[str] = None
    auto_sync_endpoint: Optional[str] = None
    auto_sync_daily_budget: Optional[int] = None
    auto_sync_max_per_run: Optional[int] = None
    auto_sync_last_run_at: Optional[str] = None
    auto_sync_last_fetched: Optional[int] = None
    auto_sync_last_saved: Optional[int] = None
    auto_sync_last_highest_match: Optional[float] = None
    auto_sync_last_reason: Optional[str] = None
