"""
Thin wrapper around AI providers (OpenAI-compatible + Anthropic).
All calls are cached by prompt hash to minimise API spend.
"""
import asyncio
import hashlib
import json
from typing import Optional

import requests
from tenacity import retry, stop_after_attempt, wait_exponential

from app.utils.cache import cache_get, cache_set


PROVIDER_PRIORITY = ["anthropic", "openrouter", "openai"]

DEFAULT_MODELS = {
    "anthropic":  "claude-haiku-4-5-20251001",
    "openrouter": "anthropic/claude-haiku-4-5",
    "openai":     "gpt-3.5-turbo",
}


def pick_provider(api_keys: dict) -> tuple[str, str]:
    """Return (provider, api_key) preferring Anthropic → OpenRouter → OpenAI.
    Ignores non-AI keys like linkedin_email/linkedin_password."""
    for p in PROVIDER_PRIORITY:
        if api_keys.get(p):
            return p, api_keys[p]
    raise ValueError("No AI provider API key found. Add one in Settings.")


def all_providers(api_keys: dict) -> list[tuple[str, str]]:
    """Return all configured AI providers in priority order."""
    return [(p, api_keys[p]) for p in PROVIDER_PRIORITY if api_keys.get(p)]


def _prompt_hash(messages: list, model: str) -> str:
    raw = json.dumps({"model": model, "messages": messages}, sort_keys=True)
    return "ai:" + hashlib.sha256(raw.encode()).hexdigest()


@retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=1, min=1, max=4))
async def call_ai(
    messages: list[dict],
    api_key: str,
    provider: str = "openai",
    model: Optional[str] = None,
    max_tokens: int = 1024,
    temperature: float = 0.3,
    cache_ttl: int = 86400,
) -> str:
    key = _prompt_hash(messages, model or provider)
    cached = cache_get(key)
    if cached is not None:
        return cached

    result = await _dispatch(messages, api_key, provider, model, max_tokens, temperature)
    cache_set(key, result, ttl=cache_ttl)
    return result


async def _dispatch(messages, api_key, provider, model, max_tokens, temperature) -> str:
    resolved_model = model or DEFAULT_MODELS.get(provider, "gpt-3.5-turbo")
    if provider == "anthropic":
        return await asyncio.to_thread(
            _call_anthropic, messages, api_key, resolved_model, max_tokens, temperature
        )
    base_url = "https://openrouter.ai/api/v1" if provider == "openrouter" else "https://api.openai.com/v1"
    return await asyncio.to_thread(
        _call_openai_compat, messages, api_key, resolved_model, max_tokens, temperature, base_url
    )


def _call_openai_compat(messages, api_key, model, max_tokens, temperature, base_url) -> str:
    resp = requests.post(
        f"{base_url}/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={"model": model, "messages": messages, "max_tokens": max_tokens, "temperature": temperature},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


def _call_anthropic(messages, api_key, model, max_tokens, temperature) -> str:
    system_msg = next((m["content"] for m in messages if m["role"] == "system"), None)
    user_messages = [m for m in messages if m["role"] != "system"]
    body: dict = {
        "model": model,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "messages": user_messages,
    }
    if system_msg:
        body["system"] = system_msg

    resp = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        },
        json=body,
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()["content"][0]["text"]
