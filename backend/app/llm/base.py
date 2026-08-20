"""LLM provider contract.

Every provider returns an LLMResult. Callers never see an exception, so a
missing API key, a rate limit or a dead model degrades the interface rather
than breaking the pipeline.

This matters more here than in most projects: the whole architecture claims
the application works with the AI switched off. That claim has to be true
in code, not just on a slide.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass
class LLMResult:
    """Outcome of one model call."""
    ok: bool
    text: str = ""
    data: dict[str, Any] = field(default_factory=dict)
    status: str = "ok"          # ok | disabled | no_key | rate_limited | error
    provider: str = ""
    model: str = ""
    latency_ms: int = 0
    error: str = ""

    @classmethod
    def disabled(cls) -> "LLMResult":
        return cls(ok=False, status="disabled")

    @classmethod
    def failed(cls, provider: str, status: str, error: str) -> "LLMResult":
        return cls(ok=False, status=status, provider=provider, error=error)


class LLMProvider(Protocol):
    name: str
    model: str

    def available(self) -> bool:
        """False if unusable — no key, no local server, etc."""
        ...

    def complete(self, system: str, user: str,
                 json_schema: dict | None = None,
                 max_tokens: int = 1024,
                 temperature: float = 0.2) -> LLMResult:
        ...


# ── JSON extraction ─────────────────────────────────────────────────────
# Models wrap JSON in prose or fences no matter how firmly you ask them not
# to. Parse defensively rather than trusting the instruction.

_FENCE = re.compile(r"```(?:json)?\s*(.+?)\s*```", re.S)


def extract_json(text: str) -> dict | None:
    if not text:
        return None

    # 1. clean parse
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        pass

    # 2. inside a code fence
    if m := _FENCE.search(text):
        try:
            parsed = json.loads(m.group(1))
            return parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            pass

    # 3. first balanced {...} block
    depth, start = 0, None
    for i, ch in enumerate(text):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start is not None:
                try:
                    parsed = json.loads(text[start:i + 1])
                    return parsed if isinstance(parsed, dict) else None
                except json.JSONDecodeError:
                    start = None

    return None


def schema_hint(schema: dict) -> str:
    """Appended to the system prompt for providers without native JSON mode."""
    return (
        "\n\nReturn ONLY valid JSON matching this schema. "
        "No prose, no code fences, no explanation.\n"
        + json.dumps(schema, indent=2)
    )
