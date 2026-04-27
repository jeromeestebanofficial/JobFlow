from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class ExperienceItem(BaseModel):
    title: str
    company: str
    location: Optional[str] = None
    start_date: str
    end_date: Optional[str] = "Present"
    bullets: List[str] = Field(default_factory=list)


class EducationItem(BaseModel):
    degree: str
    school: str
    year: Optional[str] = None
    gpa: Optional[str] = None
    honors: Optional[str] = None


class ProjectItem(BaseModel):
    name: str
    description: str
    tech: List[str] = Field(default_factory=list)
    url: Optional[str] = None


class ResumeCreate(BaseModel):
    name: Optional[str] = None
    is_default: Optional[bool] = False
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    summary: Optional[str] = None
    experience: Optional[List[ExperienceItem]] = Field(default_factory=list)
    education: Optional[List[EducationItem]] = Field(default_factory=list)
    skills: Optional[List[str]] = Field(default_factory=list)
    certifications: Optional[List[str]] = Field(default_factory=list)
    projects: Optional[List[ProjectItem]] = Field(default_factory=list)


class ResumeUpdate(ResumeCreate):
    pass


class ResumeOut(BaseModel):
    id: int
    name: str
    is_default: bool
    full_name: Optional[str]
    email: Optional[str]
    phone: Optional[str]
    location: Optional[str]
    linkedin_url: Optional[str]
    github_url: Optional[str]
    portfolio_url: Optional[str]
    summary: Optional[str]
    experience: Optional[list]
    education: Optional[list]
    skills: Optional[list]
    certifications: Optional[list]
    projects: Optional[list]
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True
