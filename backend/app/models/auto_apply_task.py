from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey
from sqlalchemy.sql import func

from app.database import Base


class AutoApplyTask(Base):
    __tablename__ = "auto_apply_tasks"

    id = Column(String, primary_key=True, index=True)  # UUID string
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False, index=True)
    resume_id = Column(Integer, ForeignKey("resumes.id"), nullable=True)

    status = Column(String, default="queued", index=True)
    # queued | running | done | error | cancelled
    current_step = Column(String, default="Queued")
    progress = Column(Integer, default=0)

    cover_letter = Column(Text, nullable=True)
    phone = Column(String, nullable=True)
    tailored_resume_json = Column(Text, nullable=True)

    messages = Column(Text, nullable=True)      # JSON array of status logs
    result_json = Column(Text, nullable=True)   # JSON result payload
    error_message = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
