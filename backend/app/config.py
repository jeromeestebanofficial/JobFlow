from pydantic_settings import BaseSettings
from typing import List, Optional


class Settings(BaseSettings):
    APP_NAME: str = "JobFlow"
    DEBUG: bool = False
    # These MUST come from .env — random defaults would log everyone out on restart
    SECRET_KEY: str = "change-me-in-env"
    JWT_SECRET: str = "change-me-in-env"

    DATABASE_URL: str = "sqlite:///./jobflow.db"

    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    REDIS_URL: Optional[str] = None
    ENCRYPTION_KEY: Optional[str] = None
    RAPIDAPI_KEY: Optional[str] = None
    RAPIDAPI_HOST: str = "linkedin-job-search-api.p.rapidapi.com"
    RAPIDAPI_LINKEDIN_PATH: str = "/active-jb-7d"
    JOB_REFRESH_INTERVAL_HOURS: int = 24

    MAX_APPLICATIONS_PER_DAY: int = 40
    MIN_DELAY_SECONDS: float = 2.0
    MAX_DELAY_SECONDS: float = 7.0

    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    # Comma-separated emails that receive is_admin on startup (SQLite-friendly bootstrap)
    ADMIN_EMAILS: str = ""

    @property
    def admin_emails_set(self) -> set[str]:
        return {e.strip().lower() for e in self.ADMIN_EMAILS.split(",") if e.strip()}

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
