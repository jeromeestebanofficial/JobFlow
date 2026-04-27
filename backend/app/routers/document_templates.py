from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.document_template import DocumentTemplate
from app.models.user import User
from app.routers.deps import get_current_user
from app.schemas.document_template import DocumentTemplateOut

router = APIRouter(prefix="/document-templates", tags=["document-templates"])


@router.get("/", response_model=list[DocumentTemplateOut])
def list_templates(
    template_type: Optional[str] = Query(None, description="resume | cover_letter"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(DocumentTemplate).filter(DocumentTemplate.is_active == True)  # noqa: E712
    if template_type:
        q = q.filter(DocumentTemplate.template_type == template_type)
    rows = q.order_by(DocumentTemplate.sort_order, DocumentTemplate.id).all()
    return rows
