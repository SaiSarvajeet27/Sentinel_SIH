"""Two providers behind one interface.

  Gemini  — every model task. Native JSON schema enforcement.
  Ollama  — local. No key, no limit, no data leaves the machine.

Swap any task to `ollama` in .env and that task runs offline. Swap all of
them and the whole application does, which is the answer to the problem
statement's "without exposing sensitive logs to external services".

Gemini's free-tier limits vary per project and are not generous. It is the
only hosted provider now, so when it is rate-limited there is nowhere else
to go but local — `quota.wait_for_slot` waits out a per-minute window
rather than silently dropping to a template.
"""
from __future__ import annotations

import logging
import time

import httpx

from app import config
from app.llm.base import LLMResult, extract_json, schema_hint

log = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════════
#  GEMINI — scenario generation
# ══════════════════════════════════════════════════════════════════════

class GeminiProvider:
    name = "gemini"

    def __init__(self) -> None:
        self.model = config.GEMINI_MODEL
        self.key = config.GEMINI_API_KEY
        self.url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self.model}:generateContent"
        )

    def available(self) -> bool:
        return bool(self.key)

    def complete(self, system: str, user: str, json_schema: dict | None = None,
                 max_tokens: int = 1024, temperature: float = 0.7) -> LLMResult:
        if not self.available():
            return LLMResult.failed(self.name, "no_key", "GEMINI_API_KEY not set")

        body: dict = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": user}]}],
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
            },
        }
        # Gemini enforces the schema itself — no need for a prompt hint.
        if json_schema:
            body["generationConfig"]["responseMimeType"] = "application/json"
            body["generationConfig"]["responseSchema"] = _to_gemini_schema(json_schema)
        # 2.5-series models "think" before answering, and thinking tokens are
        # drawn from the same maxOutputTokens budget — with it on, a 900-token
        # budget can be spent entirely on hidden reasoning, truncating the
        # visible JSON to nothing before it starts. These are short structured
        # asks, not tasks that need chain-of-thought, so it is switched off.
        # (2.5 Pro has no zero budget — only Flash and Flash-Lite do.)
        if "flash" in self.model:
            body["generationConfig"]["thinkingConfig"] = {"thinkingBudget": 0}

        t0 = time.perf_counter()
        try:
            # The key goes in a header, not the query string.
            #
            # `?key=` is the old Standard-key mechanism. Google is migrating
            # to Authorization keys — anything created in AI Studio now
            # comes back with an `AQ.` prefix instead of `AIza`, is bound to
            # a service account, and is rejected by the query-string path.
            # The failure surfaces as a **404 on the model URL**, which
            # reads like a wrong model name and sent us looking in entirely
            # the wrong place.
            #
            # `x-goog-api-key` is what the current REST docs use and it
            # accepts both key types, so this works for old and new keys.
            r = httpx.post(self.url,
                           headers={"x-goog-api-key": self.key,
                                    "Content-Type": "application/json"},
                           json=body, timeout=60.0)
            if r.status_code == 429:
                return LLMResult.failed(self.name, "rate_limited",
                                        "Gemini free-tier limit reached")
            if r.status_code == 404:
                return LLMResult.failed(
                    self.name, "error",
                    f"404 — model {self.model!r} not found on this API "
                    f"version. Set GEMINI_MODEL to a current one.")
            r.raise_for_status()
            payload = r.json()
            text = payload["candidates"][0]["content"]["parts"][0]["text"]
        except Exception as e:                       # noqa: BLE001
            log.warning("gemini call failed: %s", e)
            return LLMResult.failed(self.name, "error", str(e))

        return LLMResult(
            ok=True, text=text, data=extract_json(text) or {},
            provider=self.name, model=self.model,
            latency_ms=int((time.perf_counter() - t0) * 1000),
        )


def _to_gemini_schema(schema: dict) -> dict:
    """JSON Schema → Gemini's dialect. Strips keys it rejects."""
    allowed = {"type", "properties", "items", "required",
               "enum", "description", "nullable"}
    out: dict = {}
    for k, v in schema.items():
        if k not in allowed:
            continue
        if k == "type":
            out["type"] = str(v).upper()
        elif k == "properties":
            out["properties"] = {pk: _to_gemini_schema(pv) for pk, pv in v.items()}
        elif k == "items":
            out["items"] = _to_gemini_schema(v)
        else:
            out[k] = v
    return out


# ══════════════════════════════════════════════════════════════════════
#  GROQ — OpenAI-compatible, carries every repeated task
# ══════════════════════════════════════════════════════════════════════

class GroqProvider:
    name = "groq"

    def __init__(self) -> None:
        self.model = config.GROQ_MODEL
        self.key = config.GROQ_API_KEY
        self.url = "https://api.groq.com/openai/v1/chat/completions"

    def available(self) -> bool:
        return bool(self.key)

    def complete(self, system: str, user: str, json_schema: dict | None = None,
                 max_tokens: int = 1024, temperature: float = 0.2) -> LLMResult:
        if not self.available():
            return LLMResult.failed(self.name, "no_key", "GROQ_API_KEY not set")

        body: dict = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system + (schema_hint(json_schema) if json_schema else "")},
                {"role": "user", "content": user},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if json_schema:
            body["response_format"] = {"type": "json_object"}
        # gpt-oss models on Groq are reasoning models: with no cap, the
        # hidden reasoning trace can consume the whole max_tokens budget
        # before the visible answer starts, the same failure mode fixed for
        # Gemini in this file — a short structured ask doesn't need it.
        if "gpt-oss" in self.model:
            body["reasoning_effort"] = "low"

        t0 = time.perf_counter()
        try:
            r = httpx.post(self.url,
                           headers={"Authorization": f"Bearer {self.key}",
                                    "Content-Type": "application/json"},
                           json=body, timeout=60.0)
            if r.status_code == 429:
                return LLMResult.failed(self.name, "rate_limited",
                                        "Groq free-tier limit reached")
            r.raise_for_status()
            payload = r.json()
            text = payload["choices"][0]["message"]["content"]
        except Exception as e:                       # noqa: BLE001
            log.warning("groq call failed: %s", e)
            return LLMResult.failed(self.name, "error", str(e))

        return LLMResult(
            ok=True, text=text, data=extract_json(text) or {},
            provider=self.name, model=self.model,
            latency_ms=int((time.perf_counter() - t0) * 1000),
        )


# ══════════════════════════════════════════════════════════════════════
#  OLLAMA — local, and the fallback for everything
# ══════════════════════════════════════════════════════════════════════

class OllamaProvider:
    name = "ollama"

    # How long an availability probe stays good for. `available()` is a
    # live network call, and it is on the path of every dashboard render
    # (health_score → provider_status → available). With no Ollama running
    # the probe costs the full timeout, and on a host where `localhost`
    # resolves to ::1 before 127.0.0.1 it costs it *twice* — measured at
    # 4.5s of a 5.0s /api/dashboard response, for a check whose answer
    # changes at most when someone starts or stops a local server.
    #
    # So cache it. A stale "unavailable" costs one fallback attempt in the
    # router, which already handles a provider failing mid-call; a stale
    # "available" is corrected the same way.
    _PROBE_TTL_S = 30.0

    def __init__(self) -> None:
        self.model = config.OLLAMA_MODEL
        self.host = config.OLLAMA_HOST.rstrip("/")
        self._probe: tuple[float, bool] | None = None

    def available(self) -> bool:
        now = time.monotonic()
        if self._probe is not None and now - self._probe[0] < self._PROBE_TTL_S:
            return self._probe[1]
        try:
            ok = httpx.get(f"{self.host}/api/tags", timeout=2.0).status_code == 200
        except Exception:                            # noqa: BLE001
            ok = False
        self._probe = (now, ok)
        return ok

    def complete(self, system: str, user: str, json_schema: dict | None = None,
                 max_tokens: int = 1024, temperature: float = 0.2) -> LLMResult:
        body: dict = {
            "model": self.model,
            "system": system + (schema_hint(json_schema) if json_schema else ""),
            "prompt": user,
            "stream": False,
            "options": {"temperature": temperature, "num_predict": max_tokens},
        }
        if json_schema:
            body["format"] = "json"

        t0 = time.perf_counter()
        try:
            r = httpx.post(f"{self.host}/api/generate", json=body, timeout=180.0)
            r.raise_for_status()
            text = r.json().get("response", "")
        except Exception as e:                       # noqa: BLE001
            log.warning("ollama call failed: %s", e)
            return LLMResult.failed(self.name, "error", str(e))

        return LLMResult(
            ok=True, text=text, data=extract_json(text) or {},
            provider=self.name, model=self.model,
            latency_ms=int((time.perf_counter() - t0) * 1000),
        )


# ── registry ────────────────────────────────────────────────────────────

_PROVIDERS: dict[str, object] = {}


def get_provider(name: str):
    if name not in _PROVIDERS:
        _PROVIDERS[name] = {
            "gemini": GeminiProvider,
            "groq": GroqProvider,
            "ollama": OllamaProvider,
        }[name]()
    return _PROVIDERS[name]
