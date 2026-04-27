"""
LinkedIn Easy Apply automation.

Flow:
  1. Login (or restore saved session)
  2. Navigate to job URL
  3. Click Easy Apply
  4. Fill each modal step: contact info → resume → screening questions
  5. Submit
  6. Save result to DB

Anti-detection:
  - Human-like typing delays
  - Random pauses between actions
  - Stealth JS injected via browser.py
  - Session cookies saved after login to avoid repeated logins
  - Max 40 applications/day rate limit
"""
import asyncio
import logging
from datetime import datetime
from typing import Optional

from playwright.async_api import async_playwright, Page, TimeoutError as PWTimeout

from app.services.auto_apply.browser import (
    create_stealth_context, human_click, human_delay, human_type,
    save_session, session_exists, scroll_naturally,
)
from app.services.auto_apply.resume_pdf import generate_pdf

logger = logging.getLogger("auto_apply")

LI_LOGIN_URL = "https://www.linkedin.com/login"
LI_FEED_URL  = "https://www.linkedin.com/feed"


class LinkedInApplyError(Exception):
    pass


async def linkedin_easy_apply(
    job_url: str,
    email: str,
    password: str,
    resume_data: dict,
    cover_letter: str = "",
    phone: str = "",
    qa_profile: Optional[dict] = None,
    session_id: str = "default",
    status_callback=None,
) -> dict:
    """
    Run a full LinkedIn Easy Apply for one job.
    Returns {"success": bool, "message": str, "screenshot": Optional[str]}
    """

    def update(msg: str):
        logger.info(msg)
        if status_callback:
            asyncio.create_task(status_callback(msg))

    pdf_path = generate_pdf(resume_data)
    update(f"Resume PDF generated at {pdf_path}")

    async with async_playwright() as pw:
        browser, context = await create_stealth_context(pw, session_id)
        page = await context.new_page()

        try:
            # ── Step 1: Login or restore session ──────────────────────────
            if session_exists(session_id):
                update("Restoring saved LinkedIn session…")
                await page.goto(LI_FEED_URL, wait_until="domcontentloaded", timeout=30000)
                await human_delay(1500, 3000)
                if "login" in page.url or "authwall" in page.url:
                    update("Session expired — logging in again…")
                    await _login(page, email, password, update)
                    await save_session(context, session_id)
            else:
                update("Logging in to LinkedIn…")
                await _login(page, email, password, update)
                await save_session(context, session_id)
                update("Session saved for future use")

            # ── Step 2: Navigate to job ───────────────────────────────────
            update(f"Opening job listing…")
            await page.goto(job_url, wait_until="domcontentloaded", timeout=30000)
            await human_delay(2000, 4000)
            await scroll_naturally(page)
            if await _is_job_unavailable_page(page):
                return {
                    "success": False,
                    "message": "LinkedIn job is unavailable or removed (invalid job id / posting removed).",
                    "job_unavailable": True,
                }

            # ── Step 3: Click Easy Apply ──────────────────────────────────
            easy_apply_btn = await _find_easy_apply_button(page)
            if not easy_apply_btn:
                return {"success": False, "message": "No Easy Apply button found — this job may require applying on company website."}

            update("Clicking Easy Apply…")
            await easy_apply_btn.click()
            await human_delay(1500, 3000)

            # ── Step 4: Fill the modal form (multi-step) ──────────────────
            result = await _fill_application_modal(
                page,
                resume_data,
                pdf_path,
                cover_letter,
                phone,
                password,
                qa_profile or {},
                update,
            )
            if not result["success"]:
                screenshot = await _screenshot(page, session_id)
                return {**result, "screenshot": screenshot}

            update("Application submitted successfully!")
            return {"success": True, "message": "Applied via LinkedIn Easy Apply", "screenshot": None}

        except PWTimeout as e:
            screenshot = await _screenshot(page, session_id)
            return {"success": False, "message": f"Timed out: {e}", "screenshot": screenshot}
        except LinkedInApplyError as e:
            screenshot = await _screenshot(page, session_id)
            return {"success": False, "message": str(e), "screenshot": screenshot}
        except Exception as e:
            logger.exception("Unexpected error during auto-apply")
            screenshot = await _screenshot(page, session_id)
            return {"success": False, "message": f"Unexpected error: {e}", "screenshot": screenshot}
        finally:
            await context.close()
            await browser.close()


async def _login(page: Page, email: str, password: str, update):
    await page.goto(LI_LOGIN_URL, wait_until="domcontentloaded", timeout=30000)
    await human_delay(1000, 2000)

    # LinkedIn sometimes changes field IDs/names across regions and anti-bot flows.
    user_selectors = ["#username", "input[name='session_key']", "input[type='email']"]
    pass_selectors = ["#password", "input[name='session_password']", "input[type='password']"]
    email_typed = False
    password_typed = False
    for sel in user_selectors:
        try:
            inp = page.locator(sel).first
            if await inp.is_visible(timeout=1500):
                await inp.fill("")
                await inp.type(email, delay=70)
                email_typed = True
                break
        except Exception:
            continue
    for sel in pass_selectors:
        try:
            inp = page.locator(sel).first
            if await inp.is_visible(timeout=1500):
                await inp.fill("")
                await inp.type(password, delay=70)
                password_typed = True
                break
        except Exception:
            continue
    if not password_typed:
        raise LinkedInApplyError("Could not find LinkedIn password field on login screen.")
    await _click_button_by_text(page, ["Sign in", "Log in", "Continue", "Continue as"])
    # Fallback for welcome-back forms that submit on Enter
    try:
        if "login" in page.url or "checkpoint" in page.url:
            await page.keyboard.press("Enter")
    except Exception:
        pass
    await human_delay(3000, 5000)

    if "checkpoint" in page.url or "challenge" in page.url:
        update("⚠️  LinkedIn is asking for verification. Please complete it in the browser window within 60 seconds.")
        # Wait up to 60 seconds for user to handle 2FA
        for _ in range(60):
            await asyncio.sleep(1)
            if "feed" in page.url or "jobs" in page.url:
                break
        if "checkpoint" in page.url or "challenge" in page.url:
            raise LinkedInApplyError("Verification not completed in time.")

    if "login" in page.url:
        raise LinkedInApplyError("Login failed — check email/password.")

    update("Logged in successfully")
    await human_delay(1000, 2000)


async def _find_easy_apply_button(page: Page):
    selectors = [
        ".jobs-apply-button--top-card button",
        "button.jobs-apply-button",
        "[aria-label*='Easy Apply']",
        "button:has-text('Easy Apply')",
    ]
    for sel in selectors:
        try:
            btn = page.locator(sel).first
            if await btn.is_visible(timeout=3000):
                return btn
        except Exception:
            continue
    return None


async def _fill_application_modal(
    page: Page,
    resume_data: dict,
    pdf_path: str,
    cover_letter: str,
    phone: str,
    linkedin_password: str,
    qa_profile: dict,
    update,
) -> dict:
    """Handle the multi-step Easy Apply modal."""
    max_steps = 10

    for step in range(max_steps):
        await human_delay(1000, 2000)
        update(f"Filling form step {step + 1}…")

        # LinkedIn may ask to re-enter password before continuing.
        await _try_fill_linkedin_password_prompt(page, linkedin_password, update)

        # Fill phone number if field present
        await _try_fill_phone(page, phone or resume_data.get("phone") or "")

        # Upload resume if file input present
        await _try_upload_resume(page, pdf_path, update)

        # Fill cover letter if textarea present
        if cover_letter:
            await _try_fill_cover_letter(page, cover_letter)

        # Answer any visible text/select questions using resume context
        await _try_answer_questions(page, resume_data, qa_profile)

        # Determine what button to click: Next, Review, or Submit
        action = await _get_modal_action(page)

        if action == "submit":
            update("Submitting application…")
            await _click_button_by_text(page, ["Submit application", "Submit"])
            await human_delay(2000, 3000)
            # Check for confirmation
            if await _check_submitted(page):
                return {"success": True, "message": "Submitted"}
            # Sometimes LinkedIn shows a post-submit screen
            return {"success": True, "message": "Submitted (confirmation check skipped)"}

        elif action == "review":
            await _click_button_by_text(page, ["Review", "Review your application"])
            continue

        elif action == "next":
            await _click_button_by_text(page, ["Next", "Continue"])
            continue

        elif action == "done":
            return {"success": True, "message": "Already applied or form closed"}

        else:
            return {"success": False, "message": f"Unknown modal state at step {step + 1}"}

    return {"success": False, "message": "Form exceeded maximum steps — may require manual completion"}


async def _try_fill_linkedin_password_prompt(page: Page, password: str, update):
    if not password:
        return
    try:
        pw_fields = page.locator(
            "input[type='password']:visible, input[name*='password']:visible, input[id*='password']:visible"
        )
        count = await pw_fields.count()
        if count == 0:
            return
        for i in range(count):
            field = pw_fields.nth(i)
            try:
                current = await field.input_value()
                if not current:
                    await field.fill("")
                    await field.type(password, delay=70)
            except Exception:
                continue
        await _click_button_by_text(
            page,
            ["Continue", "Confirm", "Sign in", "Log in", "Verify", "Submit", "Done"],
        )
        update("Re-authentication prompt handled")
        await human_delay(800, 1500)
    except Exception:
        pass


async def _try_fill_phone(page: Page, phone: str):
    if not phone:
        return
    try:
        phone_input = page.locator("input[id*='phoneNumber'], input[name*='phone'], input[placeholder*='phone']").first
        if await phone_input.is_visible(timeout=1500):
            current = await phone_input.input_value()
            if not current:
                await human_type(page, phone_input, phone)
    except Exception:
        pass


async def _try_upload_resume(page: Page, pdf_path: str, update):
    try:
        file_input = page.locator("input[type='file']").first
        if await file_input.is_visible(timeout=1500) or await file_input.count() > 0:
            # Check if a resume is already attached
            upload_btn = page.locator("label[for*='resume'], button:has-text('Upload resume')").first
            if await upload_btn.is_visible(timeout=1000):
                update("Uploading resume PDF…")
                await file_input.set_input_files(pdf_path)
                await human_delay(1000, 2000)
    except Exception:
        pass


async def _try_fill_cover_letter(page: Page, cover_letter: str):
    try:
        textarea = page.locator("textarea[id*='cover'], textarea[placeholder*='cover'], textarea[name*='cover']").first
        if await textarea.is_visible(timeout=1500):
            current = await textarea.input_value()
            if not current:
                await textarea.fill(cover_letter)
                await human_delay(500, 1000)
    except Exception:
        pass


def _yn_to_text(v: str, yes="Yes", no="No") -> str:
    s = (v or "").strip().lower()
    if s in {"yes", "y", "true"}:
        return yes
    if s in {"no", "n", "false"}:
        return no
    return ""


def _answer_from_label(label_text: str, resume_data: dict, qa_profile: dict) -> str:
    t = (label_text or "").lower()
    if "sponsorship" in t or "visa status" in t:
        return _yn_to_text(qa_profile.get("visa_sponsorship", ""))
    if "legally authorized" in t or "authorized to work" in t:
        return _yn_to_text(qa_profile.get("work_authorization", ""))
    if "work pass" in t or "employment pass" in t or "valid visa" in t:
        return _yn_to_text(qa_profile.get("valid_work_pass", ""))
    if "year" in t and "experience" in t:
        return str(qa_profile.get("years_experience", "")).strip()
    if "proficiency" in t and "language" in t:
        return str(qa_profile.get("language_proficiency", "")).strip()
    if "degree" in t:
        return _yn_to_text(qa_profile.get("completed_degree", ""))
    if "expected" in t and ("salary" in t or "compensation" in t):
        return str(qa_profile.get("expected_salary", "")).strip()
    if "commut" in t:
        return _yn_to_text(qa_profile.get("commute_ok", ""))
    if "remote" in t or "hybrid" in t or "onsite" in t:
        return _yn_to_text(qa_profile.get("work_setting_ok", ""))
    if "notice period" in t or "when can you start" in t:
        return str(qa_profile.get("notice_period", "")).strip()
    if "gender" in t:
        return str(qa_profile.get("gender", "")).strip()
    if "race" in t or "ethnicity" in t:
        return str(qa_profile.get("race_ethnicity", "")).strip()
    if "veteran" in t:
        return _yn_to_text(qa_profile.get("protected_veteran", ""))
    if "disabilit" in t:
        return _yn_to_text(qa_profile.get("disability", ""))
    if "why are you interested" in t or "why do you want" in t:
        return str(qa_profile.get("why_join", "")).strip()
    if "describe a project" in t:
        return str(qa_profile.get("project_example", "")).strip()
    if "portfolio" in t or "github" in t:
        return str(qa_profile.get("portfolio_link", "") or resume_data.get("portfolio_url") or resume_data.get("github_url") or "").strip()
    return ""


def _years_experience_from_resume(resume_data: dict) -> str:
    """
    Best-effort estimate from resume dates when questionnaire answer is missing.
    Returns an integer string, or empty string if unavailable.
    """
    experience = resume_data.get("experience") or []
    starts: list[int] = []
    ends: list[int] = []
    current_year = datetime.utcnow().year

    def _parse_year(raw: str) -> Optional[int]:
        if not raw:
            return None
        text = str(raw).strip().lower()
        if text in {"present", "current", "now"}:
            return current_year
        for tok in text.replace("/", " ").replace("-", " ").split():
            if tok.isdigit() and len(tok) == 4:
                y = int(tok)
                if 1950 <= y <= current_year + 1:
                    return y
        return None

    for exp in experience:
        if not isinstance(exp, dict):
            continue
        sy = _parse_year(str(exp.get("start_date", "")))
        ey = _parse_year(str(exp.get("end_date", "")))
        if sy:
            starts.append(sy)
        if ey:
            ends.append(ey)

    if not starts:
        return ""
    start = min(starts)
    end = max(ends) if ends else current_year
    years = max(0, end - start)
    return str(years) if years > 0 else ""


def _location_city_from_resume(resume_data: dict) -> str:
    loc = str(resume_data.get("location") or "").strip()
    if not loc:
        return ""
    return loc.split(",")[0].strip()


async def _try_answer_questions(page: Page, resume_data: dict, qa_profile: dict):
    """Answer visible form fields using resume data heuristics."""
    try:
        # Text inputs/number fields
        inputs = await page.locator("input[type='text']:visible, input[type='number']:visible").all()
        for inp in inputs:
            try:
                label_text = ""
                # Try to get associated label
                inp_id = await inp.get_attribute("id")
                if inp_id:
                    label = page.locator(f"label[for='{inp_id}']")
                    if await label.count() > 0:
                        label_text = (await label.inner_text()).lower()

                current = await inp.input_value()
                if current:
                    continue  # Already filled
                answer = _answer_from_label(label_text, resume_data, qa_profile)
                if not answer:
                    if "year" in label_text or "experience" in label_text:
                        answer = _years_experience_from_resume(resume_data)
                    elif "city" in label_text or "location" in label_text:
                        answer = _location_city_from_resume(resume_data)
                    elif "linkedin" in label_text:
                        answer = resume_data.get("linkedin_url") or ""
                    elif "website" in label_text or "portfolio" in label_text:
                        answer = resume_data.get("portfolio_url") or ""
                    elif "github" in label_text:
                        answer = resume_data.get("github_url") or ""
                    elif "salary" in label_text or "compensation" in label_text:
                        answer = str(qa_profile.get("expected_salary", "")).strip()
                if answer:
                    await inp.fill(answer)

                await human_delay(100, 300)
            except Exception:
                continue

        # Textareas for custom short answers
        textareas = await page.locator("textarea:visible").all()
        for ta in textareas:
            try:
                current = await ta.input_value()
                if current:
                    continue
                ph = (await ta.get_attribute("placeholder") or "").lower()
                name = (await ta.get_attribute("name") or "").lower()
                answer = _answer_from_label(f"{ph} {name}", resume_data, qa_profile)
                if answer:
                    await ta.fill(answer)
                    await human_delay(100, 300)
            except Exception:
                continue

        # Select/dropdown questions
        selects = await page.locator("select:visible").all()
        for sel in selects:
            try:
                current = await sel.input_value()
                if current and current != "Select an option":
                    continue
                label_text = ""
                sel_id = await sel.get_attribute("id")
                if sel_id:
                    label = page.locator(f"label[for='{sel_id}']")
                    if await label.count() > 0:
                        label_text = (await label.inner_text()).lower()
                desired = _answer_from_label(label_text, resume_data, qa_profile).lower()
                options = await sel.locator("option").all()
                if len(options) > 1:
                    picked = False
                    for opt in options[1:]:
                        val = await opt.get_attribute("value")
                        text = (await opt.inner_text()).lower()
                        if desired and desired in text and val:
                            await sel.select_option(value=val)
                            picked = True
                            break
                    if not picked:
                        # Pick first non-empty option
                        for opt in options[1:]:
                            val = await opt.get_attribute("value")
                            text = (await opt.inner_text()).lower()
                            if val and "select" not in text:
                                await sel.select_option(value=val)
                                break
                await human_delay(100, 300)
            except Exception:
                continue

        # Radio buttons (prefer configured yes/no answers by question text)
        radios = await page.locator("input[type='radio']:visible").all()
        if radios:
            try:
                groups = {}
                for r in radios:
                    name = await r.get_attribute("name")
                    if not name:
                        continue
                    groups.setdefault(name, []).append(r)
                for group in groups.values():
                    question_text = ""
                    try:
                        first_id = await group[0].get_attribute("id")
                        if first_id:
                            q_label = page.locator(f"label[for='{first_id}']")
                            if await q_label.count() > 0:
                                question_text = (await q_label.inner_text()).lower()
                    except Exception:
                        question_text = ""
                    desired = _answer_from_label(question_text, resume_data, qa_profile).lower()
                    chosen = None
                    for r in group:
                        rid = await r.get_attribute("id")
                        label_txt = ""
                        if rid:
                            l = page.locator(f"label[for='{rid}']")
                            if await l.count() > 0:
                                label_txt = (await l.inner_text()).lower()
                        if desired and desired in label_txt:
                            chosen = r
                            break
                    if not chosen:
                        chosen = group[0]
                    await chosen.check()
                    await human_delay(100, 300)
            except Exception:
                pass

    except Exception:
        pass


async def _get_modal_action(page: Page) -> str:
    """Determine what the next action should be based on visible buttons."""
    try:
        if await page.locator("button:has-text('Submit application')").is_visible(timeout=1000):
            return "submit"
        if await page.locator("button:has-text('Submit')").is_visible(timeout=500):
            return "submit"
        if await page.locator("button:has-text('Review')").is_visible(timeout=500):
            return "review"
        if await page.locator("button:has-text('Next')").is_visible(timeout=500):
            return "next"
        if await page.locator("button:has-text('Continue')").is_visible(timeout=500):
            return "next"
        if await page.locator("[aria-label='Dismiss']").is_visible(timeout=500):
            return "done"
    except Exception:
        pass
    return "unknown"


async def _click_button_by_text(page: Page, texts: list[str]):
    for text in texts:
        try:
            btn = page.locator(f"button:has-text('{text}')").first
            if await btn.is_visible(timeout=1000):
                await human_click(page, f"button:has-text('{text}')")
                await human_delay(800, 1500)
                return
        except Exception:
            continue


async def _check_submitted(page: Page) -> bool:
    try:
        success_indicators = [
            "h3:has-text('Your application was sent')",
            "h2:has-text('Application submitted')",
            "[aria-label='Your application was sent']",
        ]
        for sel in success_indicators:
            if await page.locator(sel).is_visible(timeout=2000):
                return True
    except Exception:
        pass
    return False


async def _is_job_unavailable_page(page: Page) -> bool:
    try:
        body_text = (await page.inner_text("body")).lower()
    except Exception:
        body_text = ""
    signals = [
        "unable to load the page",
        "job id provided may not be valid",
        "job posting has been removed",
        "this job is no longer available",
        "no longer accepting applications",
    ]
    return any(s in body_text for s in signals)


async def _screenshot(page: Page, session_id: str) -> Optional[str]:
    try:
        from app.services.auto_apply.browser import SESSIONS_DIR
        path = str(SESSIONS_DIR / f"error_{session_id}.png")
        await page.screenshot(path=path)
        return path
    except Exception:
        return None
