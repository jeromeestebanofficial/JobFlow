from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Resume(Base):
    __tablename__ = "resumes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, default="My Resume")
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Core resume fields stored as structured text/JSON
    full_name = Column(String)
    email = Column(String)
    phone = Column(String)
    location = Column(String)
    linkedin_url = Column(String)
    github_url = Column(String)
    portfolio_url = Column(String)
    summary = Column(Text)

    # JSON arrays stored as text
    experience = Column(Text)   # [{title, company, dates, bullets[]}]
    education = Column(Text)    # [{degree, school, year, gpa}]
    skills = Column(Text)       # ["Python", "React", ...]
    certifications = Column(Text)
    projects = Column(Text)     # [{name, description, tech[], url}]

    user = relationship("User", back_populates="resumes")
    applications = relationship("Application", back_populates="resume")
