import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models.resume import Resume
from app.models.user import User
from app.schemas.resume import ResumeCreate, ResumeUpdate, ResumeOut
from app.routers.deps import get_current_user

router = APIRouter(prefix="/resumes", tags=["resumes"])


def _serialize(resume: Resume) -> dict:
    data = {c.name: getattr(resume, c.name) for c in Resume.__table__.columns}
    for field in ("experience", "education", "skills", "certifications", "projects"):
        val = data.get(field)
        if isinstance(val, str):
            try:
                data[field] = json.loads(val)
            except Exception:
                data[field] = []
    return data


@router.get("/", response_model=List[dict])
def list_resumes(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    resumes = db.query(Resume).filter(Resume.user_id == user.id).all()
    return [_serialize(r) for r in resumes]


@router.post("/", response_model=dict, status_code=201)
def create_resume(data: ResumeCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if data.is_default:
        db.query(Resume).filter(Resume.user_id == user.id).update({"is_default": False})

    resume = Resume(
        user_id=user.id,
        name=data.name,
        is_default=data.is_default,
        full_name=data.full_name,
        email=data.email,
        phone=data.phone,
        location=data.location,
        linkedin_url=data.linkedin_url,
        github_url=data.github_url,
        portfolio_url=data.portfolio_url,
        summary=data.summary,
        experience=json.dumps([e.model_dump() for e in (data.experience or [])]),
        education=json.dumps([e.model_dump() for e in (data.education or [])]),
        skills=json.dumps(data.skills or []),
        certifications=json.dumps(data.certifications or []),
        projects=json.dumps([p.model_dump() for p in (data.projects or [])]),
    )
    db.add(resume)
    db.commit()
    db.refresh(resume)
    return _serialize(resume)


@router.get("/{resume_id}", response_model=dict)
def get_resume(resume_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    resume = db.query(Resume).filter(Resume.id == resume_id, Resume.user_id == user.id).first()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    return _serialize(resume)


@router.put("/{resume_id}", response_model=dict)
def update_resume(resume_id: int, data: ResumeUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    resume = db.query(Resume).filter(Resume.id == resume_id, Resume.user_id == user.id).first()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    if data.is_default:
        db.query(Resume).filter(Resume.user_id == user.id, Resume.id != resume_id).update({"is_default": False})

    for field in ("name", "is_default", "full_name", "email", "phone", "location",
                  "linkedin_url", "github_url", "portfolio_url", "summary"):
        val = getattr(data, field, None)
        if val is not None:
            setattr(resume, field, val)

    for json_field, attr in (
        ("experience", data.experience),
        ("education", data.education),
        ("skills", data.skills),
        ("certifications", data.certifications),
        ("projects", data.projects),
    ):
        if attr is not None:
            setattr(resume, json_field, json.dumps([
                item.model_dump() if hasattr(item, "model_dump") else item for item in attr
            ]))

    db.commit()
    db.refresh(resume)
    return _serialize(resume)


@router.delete("/{resume_id}", status_code=204)
def delete_resume(resume_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    resume = db.query(Resume).filter(Resume.id == resume_id, Resume.user_id == user.id).first()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    db.delete(resume)
    db.commit()
