from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, Float
from sqlalchemy.sql import func
from app.database import Base


class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    external_id = Column(String, unique=True, index=True)
    source = Column(String, index=True)        # remoteok, hn, indeed, linkedin, etc.

    title = Column(String, nullable=False)
    company = Column(String)
    location = Column(String)
    is_remote = Column(Boolean, default=False)
    job_type = Column(String)                  # full-time, part-time, contract, etc.
    salary_min = Column(Integer)
    salary_max = Column(Integer)
    salary_currency = Column(String, default="USD")

    description = Column(Text)
    requirements = Column(Text)
    url = Column(String)
    apply_url = Column(String)
    logo_url = Column(String)

    tags = Column(Text)                        # JSON array of tag strings
    posted_at = Column(DateTime(timezone=True))
    expires_at = Column(DateTime(timezone=True))
    fetched_at = Column(DateTime(timezone=True), server_default=func.now())

    # AI-computed match score (0-100) – cached per user via application table
    is_active = Column(Boolean, default=True)
