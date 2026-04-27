from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.document_template import DocumentTemplate
from app.models.user import User
from app.routers.deps import get_current_admin
from app.schemas.document_template import (
    AvailableSlugsOut,
    DocumentTemplateAdminOut,
    DocumentTemplateCreate,
    DocumentTemplateUpdate,
)
from app.services.document_pdf import list_cover_slugs, list_resume_slugs

router = APIRouter(prefix="/admin/document-templates", tags=["admin-document-templates"])


@router.get("/available-slugs", response_model=AvailableSlugsOut)
def available_slugs(_admin: User = Depends(get_current_admin)):
    return AvailableSlugsOut(resume=list_resume_slugs(), cover_letter=list_cover_slugs())


@router.get("/", response_model=list[DocumentTemplateAdminOut])
def admin_list(_admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    return db.query(DocumentTemplate).order_by(DocumentTemplate.template_type, DocumentTemplate.sort_order, DocumentTemplate.id).all()


@router.post("/", response_model=DocumentTemplateAdminOut, status_code=201)
def admin_create(
    data: DocumentTemplateCreate,
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    if data.template_type == "resume":
        if data.slug not in list_resume_slugs():
            raise HTTPException(
                status_code=400,
                detail=f"Unknown resume layout slug. Available: {', '.join(list_resume_slugs())}",
            )
    elif data.template_type == "cover_letter":
        if data.slug not in list_cover_slugs():
            raise HTTPException(
                status_code=400,
                detail=f"Unknown cover letter layout slug. Available: {', '.join(list_cover_slugs())}",
            )

    dup = (
        db.query(DocumentTemplate)
        .filter(
            DocumentTemplate.template_type == data.template_type,
            DocumentTemplate.slug == data.slug,
        )
        .first()
    )
    if dup:
        raise HTTPException(status_code=409, detail="A template with this type and slug already exists")

    row = DocumentTemplate(
        template_type=data.template_type,
        slug=data.slug,
        name=data.name,
        description=data.description,
        sort_order=data.sort_order,
        is_active=data.is_active,
        is_system=False,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/{template_id}", response_model=DocumentTemplateAdminOut)
def admin_update(
    template_id: int,
    data: DocumentTemplateUpdate,
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    row = db.query(DocumentTemplate).filter(DocumentTemplate.id == template_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Template not found")
    for field, val in data.model_dump(exclude_none=True).items():
        setattr(row, field, val)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{template_id}", status_code=204)
def admin_delete(
    template_id: int,
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    row = db.query(DocumentTemplate).filter(DocumentTemplate.id == template_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Template not found")
    if row.is_system:
        raise HTTPException(status_code=400, detail="System templates cannot be deleted — deactivate instead")
    db.delete(row)
    db.commit()
