"""
Stealth browser utilities for Playwright.
Mimics real user behaviour to avoid bot detection.
"""
import asyncio
import random
import string
from pathlib import Path
from typing import Optional

from playwright.async_api import async_playwright, Browser, BrowserContext, Page

SESSIONS_DIR = Path(__file__).parent.parent.parent.parent / "sessions"
SESSIONS_DIR.mkdir(exist_ok=True)

# Realistic viewport sizes
VIEWPORTS = [
    {"width": 1366, "height": 768},
    {"width": 1440, "height": 900},
    {"width": 1920, "height": 1080},
    {"width": 1280, "height": 800},
]

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
]


async def human_delay(min_ms: int = 800, max_ms: int = 2500):
    await asyncio.sleep(random.uniform(min_ms / 1000, max_ms / 1000))


async def human_type(page: Page, selector: str, text: str):
    """Type text character by character with random delays like a human."""
    await page.click(selector)
    await human_delay(200, 500)
    # Clear field first
    await page.fill(selector, "")
    await human_delay(100, 300)
    for char in text:
        await page.type(selector, char, delay=random.randint(50, 180))
    await human_delay(200, 500)


async def human_click(page: Page, selector: str):
    """Click with slight randomness."""
    await page.hover(selector)
    await human_delay(200, 600)
    await page.click(selector)
    await human_delay(300, 800)


async def scroll_naturally(page: Page):
    """Scroll the page in a human-like pattern."""
    for _ in range(random.randint(2, 4)):
        scroll_amount = random.randint(200, 500)
        await page.mouse.wheel(0, scroll_amount)
        await human_delay(400, 900)


async def create_stealth_context(playwright, session_id: str) -> tuple[Browser, BrowserContext]:
    """Create a browser context with stealth settings and optional session restore."""
    ua = random.choice(USER_AGENTS)
    vp = random.choice(VIEWPORTS)
    session_file = SESSIONS_DIR / f"{session_id}.json"

    browser = await playwright.chromium.launch(
        headless=False,  # Visible so user can handle 2FA if needed
        args=[
            "--no-sandbox",
            "--disable-blink-features=AutomationControlled",
            "--disable-infobars",
            "--disable-dev-shm-usage",
            "--disable-extensions",
            f"--window-size={vp['width']},{vp['height']}",
        ],
    )

    context_options = {
        "viewport": vp,
        "user_agent": ua,
        "locale": "en-US",
        "timezone_id": "Asia/Singapore",
        "permissions": ["geolocation"],
        "extra_http_headers": {
            "Accept-Language": "en-US,en;q=0.9",
        },
    }

    if session_file.exists():
        context_options["storage_state"] = str(session_file)

    context = await browser.new_context(**context_options)

    # Inject stealth JS to hide automation fingerprints
    await context.add_init_script("""
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        window.chrome = { runtime: {} };
        Object.defineProperty(navigator, 'permissions', {
            get: () => ({ query: () => Promise.resolve({ state: 'granted' }) })
        });
    """)

    return browser, context


async def save_session(context: BrowserContext, session_id: str):
    session_file = SESSIONS_DIR / f"{session_id}.json"
    await context.storage_state(path=str(session_file))


def session_exists(session_id: str) -> bool:
    return (SESSIONS_DIR / f"{session_id}.json").exists()
