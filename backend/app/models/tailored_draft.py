from sqlalchemy import Column, Integer, DateTime, Text, ForeignKey, UniqueConstraint, String
from sqlalchemy.sql import func

from app.database import Base


class TailoredDraft(Base):
    __tablename__ = "tailored_drafts"
    __table_args__ = (
        UniqueConstraint("user_id", "job_id", name="uq_tailored_drafts_user_job"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False, index=True)
    resume_id = Column(Integer, ForeignKey("resumes.id"), nullable=True)

    tailored_resume_json = Column(Text, nullable=False)
    cover_letter = Column(Text, nullable=False)
    experiment_variant = Column(String, nullable=True)   # "A" | "B"
    resume_style = Column(String, nullable=True)         # e.g. concise | detailed
    role_type = Column(String, nullable=True)            # normalized role bucket

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())
