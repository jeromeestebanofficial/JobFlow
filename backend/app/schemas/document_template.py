from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class DocumentTemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    template_type: str
    slug: str
    name: str
    description: Optional[str] = None
    sort_order: int = 0


class DocumentTemplateAdminOut(DocumentTemplateOut):
    is_active: bool
    is_system: bool


class DocumentTemplateCreate(BaseModel):
    template_type: str = Field(..., pattern="^(resume|cover_letter)$")
    slug: str = Field(..., min_length=1, max_length=64)
    name: str = Field(..., min_length=1, max_length=128)
    description: Optional[str] = None
    sort_order: int = 0
    is_active: bool = True


class DocumentTemplateUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=128)
    description: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class AvailableSlugsOut(BaseModel):
    resume: list[str]
    cover_letter: list[str]
