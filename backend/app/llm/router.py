"""Task → provider routing, with fallback.

The only entry point the rest of the application uses. Nothing else imports
a provider directly, so the whole system's AI behaviour is controlled by
five environment variables and one master switch.

    ask("explain", system, user, schema)

Fallback order is deliberate: try the configured provider, then the other
hosted one, then local. If everything fails you get an LLMResult with ok
False — never an exception. Callers substitute a deterministic template.
"""
from __future__ import annotations

import logging

from app import config
from app.llm.base import LLMResult
from app.llm import quota
from app.llm.providers import get_provider

log = logging.getLogger(__name__)

# Try the other hosted provider before falling all the way to local —
# Gemini's per-project daily quota can be small enough to exhaust in one
# demo run, and Groq's is both larger and a published fixed number. Local
# Ollama is the last resort, since it needs a model pulled and running.
FALLBACK_ORDER = ["groq", "gemini", "ollama"]

# Tracks whether the AI is on. Flipped at runtime from Settings — the demo
# control that proves the model holds no authority.
_ai_enabled: bool = config.AI_ENABLED


def ai_enabled() -> bool:
    return _ai_enabled


def set_ai_enabled(value: bool) -> None:
    global _ai_enabled
    _ai_enabled = value
    log.info("AI assistant %s", "enabled" if value else "DISABLED")


def ask(task: str, system: str, user: str,
        json_schema: dict | None = None,
        max_tokens: int = 1024,
        temperature: float | None = None,
        allow_fallback: bool = True) -> LLMResult:
    """Run one task through whichever provider is configured for it."""

    if not _ai_enabled:
        return LLMResult.disabled()

    configured = config.TASK_PROVIDER.get(task, "gemini")
    if configured == "off":
        return LLMResult.disabled()

    if temperature is None:
        temperature = 0.7 if task == "scenario" else 0.2

    order = [configured]
    if allow_fallback:
        order += [p for p in FALLBACK_ORDER if p != configured]

    last = LLMResult.failed("none", "error", "no provider available")
    for name in order:
        provider = get_provider(name)
        if not provider.available():
            log.debug("provider %s unavailable, skipping", name)
            continue

        # Reserve budget before dispatching. Failed calls still count against
        # provider rate limits, so recording them is both safer and honest.
        #
        # A per-minute window clears by itself, so wait a few seconds for it
        # rather than falling through to a template. A daily limit does not
        # clear, and `wait_for_slot` returns immediately for that case.
        allowed, reason = quota.wait_for_slot(name, max_tokens)
        if not allowed:
            log.warning("task '%s' via %s skipped: %s", task, name, reason)
            last = LLMResult.failed(name, "budget_exhausted", reason)
            continue
        quota.record(name, max_tokens)

        result = provider.complete(system, user, json_schema,
                                   max_tokens, temperature)
        if result.ok:
            if name != configured:
                log.warning("task '%s' fell back from %s to %s",
                            task, configured, name)
            return result

        log.warning("task '%s' via %s failed: %s", task, name, result.status)
        last = result

    return last


def provider_status() -> dict:
    """Feeds the health panel and the system indicator on the dashboard."""
    out: dict = {"ai_enabled": _ai_enabled, "providers": {}, "tasks": {}}
    for name in ("gemini", "groq", "ollama"):
        p = get_provider(name)
        out["providers"][name] = {
            "available": p.available(),
            "model": p.model,
            "local": name == "ollama",
        }
    for task, prov in config.TASK_PROVIDER.items():
        out["tasks"][task] = prov
    out["fully_local"] = all(
        p == "ollama" for p in config.TASK_PROVIDER.values()
    )
    return out
