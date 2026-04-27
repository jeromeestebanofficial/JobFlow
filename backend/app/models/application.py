from sqlalchemy import Column, Integer, String, DateTime, Text, Float, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Application(Base):
    __tablename__ = "applications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False)
    resume_id = Column(Integer, ForeignKey("resumes.id"), nullable=True)

    status = Column(String, default="pending")
    # pending | applied | interview | offer | rejected | withdrawn | skipped

    match_score = Column(Float)                # 0-100 AI match score
    tailored_resume = Column(Text)             # JSON of tailored resume snapshot
    cover_letter = Column(Text)

    is_auto_applied = Column(Boolean, default=False)
    auto_apply_status = Column(String, nullable=True)   # queued | running | done | error | cancelled
    auto_apply_task_id = Column(String, nullable=True)
    auto_apply_error = Column(Text, nullable=True)
    applied_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    notes = Column(Text)

    user = relationship("User", back_populates="applications")
    job = relationship("Job")
    resume = relationship("Resume", back_populates="applications")
