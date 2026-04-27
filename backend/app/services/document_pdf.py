"""
PDF generation for resumes (multiple layouts) and cover letters.
Slug registry must match rows admins can attach in document_templates.
"""
import html
import os
import re
import tempfile
from datetime import date
from io import BytesIO
from pathlib import Path
from typing import Callable, Optional
from zipfile import ZipFile

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY, TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

RESUMES_DIR = Path(__file__).parent.parent.parent.parent / "generated_resumes"
RESUMES_DIR.mkdir(exist_ok=True)


def _esc(text: str) -> str:
    return html.escape(text or "", quote=False).replace("\n", "<br/>")


def _story_classic(resume_data: dict) -> list:
    story = []
    name_style = ParagraphStyle(
        "Name", fontSize=20, fontName="Helvetica-Bold", alignment=TA_CENTER, spaceAfter=4
    )
    contact_style = ParagraphStyle(
        "Contact",
        fontSize=9,
        fontName="Helvetica",
        alignment=TA_CENTER,
        spaceAfter=2,
        textColor=colors.HexColor("#555555"),
    )
    section_style = ParagraphStyle(
        "Section",
        fontSize=11,
        fontName="Helvetica-Bold",
        spaceBefore=10,
        spaceAfter=4,
        textColor=colors.HexColor("#1a1a1a"),
    )
    body_style = ParagraphStyle("Body", fontSize=9, fontName="Helvetica", spaceAfter=2, leading=14)
    bullet_style = ParagraphStyle(
        "Bullet", fontSize=9, fontName="Helvetica", spaceAfter=1, leading=13, leftIndent=12, bulletIndent=0
    )
    job_title_style = ParagraphStyle("JobTitle", fontSize=10, fontName="Helvetica-Bold", spaceAfter=1)
    meta_style = ParagraphStyle(
        "Meta", fontSize=9, fontName="Helvetica", textColor=colors.HexColor("#666666"), spaceAfter=3
    )

    story.append(Paragraph(_esc(resume_data.get("full_name") or ""), name_style))
    contact_parts = []
    if resume_data.get("email"):
        contact_parts.append(resume_data["email"])
    if resume_data.get("phone"):
        contact_parts.append(resume_data["phone"])
    if resume_data.get("location"):
        contact_parts.append(resume_data["location"])
    if resume_data.get("linkedin_url"):
        contact_parts.append(resume_data["linkedin_url"])
    if resume_data.get("github_url"):
        contact_parts.append(resume_data["github_url"])
    if contact_parts:
        story.append(Paragraph(_esc(" · ".join(contact_parts)), contact_style))

    story.append(
        HRFlowable(width="100%", thickness=1, color=colors.HexColor("#cccccc"), spaceAfter=6)
    )

    if resume_data.get("summary"):
        story.append(Paragraph("PROFESSIONAL SUMMARY", section_style))
        story.append(Paragraph(_esc(resume_data["summary"]), body_style))
        story.append(
            HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#eeeeee"), spaceAfter=4)
        )

    skills = resume_data.get("skills") or []
    if skills:
        story.append(Paragraph("TECHNICAL SKILLS", section_style))
        story.append(Paragraph(_esc(", ".join(skills)), body_style))
        story.append(
            HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#eeeeee"), spaceAfter=4)
        )

    experience = resume_data.get("experience") or []
    if experience:
        story.append(Paragraph("WORK EXPERIENCE", section_style))
        for exp in experience:
            if not isinstance(exp, dict):
                continue
            dates = f"{exp.get('start_date', '')} – {exp.get('end_date', 'Present')}"
            story.append(
                Paragraph(_esc(f"{exp.get('title', '')} | {exp.get('company', '')}"), job_title_style)
            )
            loc = exp.get("location", "")
            story.append(Paragraph(_esc(f"{dates}{' · ' + loc if loc else ''}"), meta_style))
            for bullet in exp.get("bullets") or []:
                if str(bullet).strip():
                    story.append(Paragraph(_esc(f"• {bullet}"), bullet_style))
            story.append(Spacer(1, 4))
        story.append(
            HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#eeeeee"), spaceAfter=4)
        )

    education = resume_data.get("education") or []
    if education:
        story.append(Paragraph("EDUCATION", section_style))
        for edu in education:
            if not isinstance(edu, dict):
                continue
            story.append(Paragraph(_esc(edu.get("degree", "")), job_title_style))
            meta = edu.get("school", "")
            if edu.get("year"):
                meta += f" · {edu['year']}"
            if edu.get("gpa"):
                meta += f" · GPA: {edu['gpa']}"
            story.append(Paragraph(_esc(meta), meta_style))

    return story


def _story_compact(resume_data: dict) -> list:
    """Dense single-column layout for ATS-style submissions."""
    story = []
    name_style = ParagraphStyle(
        "NameC", fontSize=16, fontName="Helvetica-Bold", alignment=TA_CENTER, spaceAfter=2
    )
    contact_style = ParagraphStyle(
        "ContactC",
        fontSize=8,
        fontName="Helvetica",
        alignment=TA_CENTER,
        spaceAfter=2,
        textColor=colors.HexColor("#555555"),
    )
    section_style = ParagraphStyle(
        "SectionC",
        fontSize=9,
        fontName="Helvetica-Bold",
        spaceBefore=6,
        spaceAfter=2,
        textColor=colors.HexColor("#1a1a1a"),
    )
    body_style = ParagraphStyle("BodyC", fontSize=8, fontName="Helvetica", spaceAfter=1, leading=11)
    bullet_style = ParagraphStyle(
        "BulletC", fontSize=8, fontName="Helvetica", spaceAfter=0, leading=10, leftIndent=10, bulletIndent=0
    )
    job_title_style = ParagraphStyle("JobTitleC", fontSize=9, fontName="Helvetica-Bold", spaceAfter=0)
    meta_style = ParagraphStyle(
        "MetaC", fontSize=8, fontName="Helvetica", textColor=colors.HexColor("#666666"), spaceAfter=2
    )

    story.append(Paragraph(_esc(resume_data.get("full_name") or ""), name_style))
    contact_parts = []
    if resume_data.get("email"):
        contact_parts.append(resume_data["email"])
    if resume_data.get("phone"):
        contact_parts.append(resume_data["phone"])
    if resume_data.get("location"):
        contact_parts.append(resume_data["location"])
    if resume_data.get("linkedin_url"):
        contact_parts.append(resume_data["linkedin_url"])
    if resume_data.get("github_url"):
        contact_parts.append(resume_data["github_url"])
    if contact_parts:
        story.append(Paragraph(_esc(" · ".join(contact_parts)), contact_style))

    story.append(HRFlowable(width="100%", thickness=0.75, color=colors.HexColor("#cccccc"), spaceAfter=4))

    if resume_data.get("summary"):
        story.append(Paragraph("PROFESSIONAL SUMMARY", section_style))
        story.append(Paragraph(_esc(resume_data["summary"]), body_style))
        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#eeeeee"), spaceAfter=3))

    skills = resume_data.get("skills") or []
    if skills:
        story.append(Paragraph("SKILLS", section_style))
        story.append(Paragraph(_esc(", ".join(skills)), body_style))
        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#eeeeee"), spaceAfter=3))

    experience = resume_data.get("experience") or []
    if experience:
        story.append(Paragraph("EXPERIENCE", section_style))
        for exp in experience:
            if not isinstance(exp, dict):
                continue
            dates = f"{exp.get('start_date', '')} – {exp.get('end_date', 'Present')}"
            story.append(
                Paragraph(_esc(f"{exp.get('title', '')} | {exp.get('company', '')}"), job_title_style)
            )
            loc = exp.get("location", "")
            story.append(Paragraph(_esc(f"{dates}{' · ' + loc if loc else ''}"), meta_style))
            for bullet in exp.get("bullets") or []:
                if str(bullet).strip():
                    story.append(Paragraph(_esc(f"• {bullet}"), bullet_style))
            story.append(Spacer(1, 2))
        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#eeeeee"), spaceAfter=3))

    education = resume_data.get("education") or []
    if education:
        story.append(Paragraph("EDUCATION", section_style))
        for edu in education:
            if not isinstance(edu, dict):
                continue
            story.append(Paragraph(_esc(edu.get("degree", "")), job_title_style))
            meta = edu.get("school", "")
            if edu.get("year"):
                meta += f" · {edu['year']}"
            if edu.get("gpa"):
                meta += f" · GPA: {edu['gpa']}"
            story.append(Paragraph(_esc(meta), meta_style))

    return story


def _story_modern(resume_data: dict) -> list:
    """Name/header full width, then two-column body (skills/contact | main)."""
    section_style = ParagraphStyle(
        "Section",
        fontSize=10,
        fontName="Helvetica-Bold",
        spaceBefore=6,
        spaceAfter=3,
        textColor=colors.HexColor("#1a365d"),
    )
    body_style = ParagraphStyle("Body", fontSize=8.5, fontName="Helvetica", spaceAfter=2, leading=12)
    bullet_style = ParagraphStyle(
        "Bullet", fontSize=8.5, fontName="Helvetica", spaceAfter=1, leading=11, leftIndent=10, bulletIndent=0
    )
    job_title_style = ParagraphStyle("JobTitle", fontSize=9, fontName="Helvetica-Bold", spaceAfter=1)
    meta_style = ParagraphStyle(
        "Meta", fontSize=8, fontName="Helvetica", textColor=colors.HexColor("#555555"), spaceAfter=2
    )
    small_heading = ParagraphStyle(
        "SmallH", fontSize=8, fontName="Helvetica-Bold", textColor=colors.HexColor("#2c5282"), spaceAfter=2
    )

    story = []
    name_style = ParagraphStyle(
        "Name", fontSize=18, fontName="Helvetica-Bold", alignment=TA_LEFT, spaceAfter=2
    )
    contact_style = ParagraphStyle(
        "Contact", fontSize=8, fontName="Helvetica", alignment=TA_LEFT, spaceAfter=6, textColor=colors.HexColor("#444444")
    )

    story.append(Paragraph(_esc(resume_data.get("full_name") or ""), name_style))
    contact_lines = []
    for key, label in [
        ("email", ""),
        ("phone", ""),
        ("location", ""),
        ("linkedin_url", "LinkedIn: "),
        ("github_url", "GitHub: "),
        ("portfolio_url", "Portfolio: "),
    ]:
        v = resume_data.get(key)
        if v:
            contact_lines.append(f"{label}{v}")
    if contact_lines:
        story.append(Paragraph(_esc(" · ".join(contact_lines)), contact_style))

    left_cells: list = []
    left_cells.append(Paragraph("CONTACT & LINKS", small_heading))
    if contact_lines:
        for line in contact_lines[:4]:
            left_cells.append(Paragraph(_esc(line), body_style))
    left_cells.append(Spacer(1, 8))

    skills = resume_data.get("skills") or []
    if skills:
        left_cells.append(Paragraph("SKILLS", small_heading))
        left_cells.append(Paragraph(_esc(", ".join(skills)), body_style))

    right_cells: list = []
    if resume_data.get("summary"):
        right_cells.append(Paragraph("SUMMARY", section_style))
        right_cells.append(Paragraph(_esc(resume_data["summary"]), body_style))
        right_cells.append(Spacer(1, 4))

    experience = resume_data.get("experience") or []
    if experience:
        right_cells.append(Paragraph("EXPERIENCE", section_style))
        for exp in experience:
            if not isinstance(exp, dict):
                continue
            dates = f"{exp.get('start_date', '')} – {exp.get('end_date', 'Present')}"
            right_cells.append(
                Paragraph(_esc(f"{exp.get('title', '')} — {exp.get('company', '')}"), job_title_style)
            )
            loc = exp.get("location", "")
            right_cells.append(Paragraph(_esc(f"{dates}{' · ' + loc if loc else ''}"), meta_style))
            for bullet in exp.get("bullets") or []:
                if str(bullet).strip():
                    right_cells.append(Paragraph(_esc(f"• {bullet}"), bullet_style))
            right_cells.append(Spacer(1, 3))

    education = resume_data.get("education") or []
    if education:
        right_cells.append(Paragraph("EDUCATION", section_style))
        for edu in education:
            if not isinstance(edu, dict):
                continue
            right_cells.append(Paragraph(_esc(edu.get("degree", "")), job_title_style))
            meta = edu.get("school", "")
            if edu.get("year"):
                meta += f", {edu['year']}"
            right_cells.append(Paragraph(_esc(meta), meta_style))

    if not left_cells:
        left_cells = [Paragraph("", body_style)]
    if not right_cells:
        right_cells = [Paragraph("", body_style)]

    tbl = Table([[left_cells, right_cells]], colWidths=[2.15 * inch, 4.85 * inch])
    tbl.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f0f4f8")),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e0")),
            ]
        )
    )
    story.append(tbl)
    return story


RESUME_BUILDERS: dict[str, Callable[[dict], list]] = {
    "classic": _story_classic,
    "modern": _story_modern,
    "compact": _story_compact,
}


def generate_resume_pdf(
    resume_data: dict,
    template_slug: str = "classic",
    output_path: Optional[str] = None,
) -> str:
    slug = template_slug if template_slug in RESUME_BUILDERS else "classic"
    builder = RESUME_BUILDERS[slug]
    if not output_path:
        name_slug = (resume_data.get("full_name") or "resume").replace(" ", "_").lower()
        output_path = str(RESUMES_DIR / f"{name_slug}_{slug}.pdf")

    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        rightMargin=0.75 * inch,
        leftMargin=0.75 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
    )
    doc.build(builder(resume_data))
    return output_path


def _cover_story_standard(body: str, full_name: str, job_title: str, company: str) -> list:
    story = []
    h_name = ParagraphStyle("HN", fontSize=14, fontName="Helvetica-Bold", spaceAfter=2)
    sub = ParagraphStyle("Sub", fontSize=9, fontName="Helvetica", textColor=colors.HexColor("#444444"), spaceAfter=12)
    date_st = ParagraphStyle("Date", fontSize=9, fontName="Helvetica", alignment=TA_RIGHT, spaceAfter=16)
    body_st = ParagraphStyle("Body", fontSize=10, fontName="Helvetica", alignment=TA_JUSTIFY, leading=14, spaceAfter=10)

    story.append(Paragraph(_esc(full_name), h_name))
    story.append(Paragraph(_esc(date.today().strftime("%B %d, %Y")), date_st))

    line = f"Re: {job_title or 'Application'}"
    if company:
        line += f" — {company}"
    story.append(Paragraph(_esc(line), sub))

    for chunk in re.split(r"\n\s*\n", body.strip()):
        if chunk.strip():
            story.append(Paragraph(_esc(chunk.strip()), body_st))

    story.append(Spacer(1, 16))
    story.append(Paragraph(_esc("Sincerely,"), body_st))
    story.append(Spacer(1, 20))
    story.append(Paragraph(_esc(full_name), ParagraphStyle("Sig", fontSize=10, fontName="Helvetica-Bold")))

    return story


def _cover_story_minimal(body: str, full_name: str, job_title: str, company: str) -> list:
    story = []
    h = ParagraphStyle("H", fontSize=12, fontName="Helvetica-Bold", spaceAfter=10)
    meta = ParagraphStyle("M", fontSize=9, fontName="Helvetica", textColor=colors.HexColor("#666666"), spaceAfter=14)
    body_st = ParagraphStyle("B", fontSize=10, fontName="Helvetica", alignment=TA_LEFT, leading=13, spaceAfter=8)

    story.append(Paragraph(_esc(full_name), h))
    subj = job_title or "Application"
    if company:
        subj += f" @ {company}"
    story.append(Paragraph(_esc(subj), meta))

    for chunk in re.split(r"\n\s*\n", body.strip()):
        if chunk.strip():
            story.append(Paragraph(_esc(chunk.strip()), body_st))

    story.append(Spacer(1, 12))
    story.append(Paragraph(_esc(full_name), ParagraphStyle("S", fontSize=10, fontName="Helvetica")))

    return story


COVER_BUILDERS: dict[str, Callable[[str, str, str, str], list]] = {
    "standard": _cover_story_standard,
    "minimal": _cover_story_minimal,
}


def list_resume_slugs() -> list[str]:
    return list(RESUME_BUILDERS.keys())


def list_cover_slugs() -> list[str]:
    return list(COVER_BUILDERS.keys())


def generate_cover_letter_pdf(
    cover_letter_body: str,
    full_name: str,
    job_title: str = "",
    company: str = "",
    template_slug: str = "standard",
    output_path: Optional[str] = None,
) -> str:
    slug = template_slug if template_slug in COVER_BUILDERS else "standard"
    builder = COVER_BUILDERS[slug]
    if not output_path:
        name_slug = (full_name or "cover").replace(" ", "_").lower()
        output_path = str(RESUMES_DIR / f"{name_slug}_cover_{slug}.pdf")

    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        rightMargin=0.85 * inch,
        leftMargin=0.85 * inch,
        topMargin=0.85 * inch,
        bottomMargin=0.85 * inch,
    )
    doc.build(builder(cover_letter_body, full_name, job_title, company))
    return output_path


def build_tailored_documents_zip(
    tailored_resume: dict,
    cover_letter: str,
    resume_slug: str,
    cover_slug: str,
    job_title: str = "",
    company: str = "",
) -> bytes:
    """Build an in-memory zip with resume.pdf and cover_letter.pdf."""
    full_name = tailored_resume.get("full_name") or "Candidate"
    buf = BytesIO()
    with tempfile.TemporaryDirectory() as tmp:
        r_path = os.path.join(tmp, "resume.pdf")
        c_path = os.path.join(tmp, "cover_letter.pdf")
        generate_resume_pdf(tailored_resume, resume_slug, r_path)
        generate_cover_letter_pdf(cover_letter, full_name, job_title, company, cover_slug, c_path)
        with ZipFile(buf, "w") as zf:
            zf.write(r_path, arcname="resume.pdf")
            zf.write(c_path, arcname="cover_letter.pdf")
    buf.seek(0)
    return buf.getvalue()
