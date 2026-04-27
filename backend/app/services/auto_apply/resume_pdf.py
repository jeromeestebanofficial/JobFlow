"""
Generate a PDF resume from structured resume data using ReportLab.
Delegates to document_pdf layouts; default layout is classic (backward compatible).
"""
from typing import Optional

from app.services.document_pdf import generate_resume_pdf


def generate_pdf(
    resume_data: dict,
    output_path: Optional[str] = None,
    template_slug: str = "classic",
) -> str:
    return generate_resume_pdf(resume_data, template_slug, output_path)
