from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker
from app.config import settings

connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(settings.DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    import app.models  # noqa: F401 — register all models on Base.metadata

    Base.metadata.create_all(bind=engine)


def run_lightweight_migrations():
    """ALTERs for existing DBs (create_all does not add new columns to old tables)."""
    insp = inspect(engine)
    if not insp.has_table("users"):
        return
    cols = {c["name"] for c in insp.get_columns("users")}
    with engine.begin() as conn:
        if "is_admin" not in cols:
            if settings.DATABASE_URL.startswith("sqlite"):
                conn.execute(text("ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT 0"))
            else:
                conn.execute(text("ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT false"))
    if insp.has_table("applications"):
        app_cols = {c["name"] for c in insp.get_columns("applications")}
        with engine.begin() as conn:
            if "auto_apply_status" not in app_cols:
                conn.execute(text("ALTER TABLE applications ADD COLUMN auto_apply_status VARCHAR"))
            if "auto_apply_task_id" not in app_cols:
                conn.execute(text("ALTER TABLE applications ADD COLUMN auto_apply_task_id VARCHAR"))
            if "auto_apply_error" not in app_cols:
                conn.execute(text("ALTER TABLE applications ADD COLUMN auto_apply_error TEXT"))
    if insp.has_table("auto_apply_tasks"):
        task_cols = {c["name"] for c in insp.get_columns("auto_apply_tasks")}
        with engine.begin() as conn:
            if "tailored_resume_json" not in task_cols:
                conn.execute(text("ALTER TABLE auto_apply_tasks ADD COLUMN tailored_resume_json TEXT"))
    if insp.has_table("tailored_drafts"):
        draft_cols = {c["name"] for c in insp.get_columns("tailored_drafts")}
        with engine.begin() as conn:
            if "experiment_variant" not in draft_cols:
                conn.execute(text("ALTER TABLE tailored_drafts ADD COLUMN experiment_variant VARCHAR"))
            if "resume_style" not in draft_cols:
                conn.execute(text("ALTER TABLE tailored_drafts ADD COLUMN resume_style VARCHAR"))
            if "role_type" not in draft_cols:
                conn.execute(text("ALTER TABLE tailored_drafts ADD COLUMN role_type VARCHAR"))


def seed_document_templates():
    from sqlalchemy.orm import Session
    from app.models.document_template import DocumentTemplate

    db = SessionLocal()
    try:
        if db.query(DocumentTemplate).first() is not None:
            return
        defaults = [
            ("resume", "classic", "Classic centered", "Traditional centered header and sections", 0, True),
            ("resume", "modern", "Modern two-column", "Sidebar for skills and contact", 1, True),
            ("resume", "compact", "Compact ATS", "Tighter spacing, single column", 2, True),
            ("cover_letter", "standard", "Standard business", "Dated letter with closing block", 0, True),
            ("cover_letter", "minimal", "Minimal clean", "Simple header and body", 1, True),
        ]
        for template_type, slug, name, description, sort_order, is_system in defaults:
            db.add(
                DocumentTemplate(
                    template_type=template_type,
                    slug=slug,
                    name=name,
                    description=description,
                    sort_order=sort_order,
                    is_active=True,
                    is_system=is_system,
                )
            )
        db.commit()
    finally:
        db.close()


def promote_admin_users():
    from app.models.user import User

    emails = settings.admin_emails_set
    if not emails:
        return
    db = SessionLocal()
    try:
        for u in db.query(User).all():
            if u.email and u.email.lower() in emails:
                u.is_admin = True
        db.commit()
    finally:
        db.close()


def init_db():
    create_tables()
    run_lightweight_migrations()
    seed_document_templates()
    promote_admin_users()
