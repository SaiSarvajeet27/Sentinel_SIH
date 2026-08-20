"""The security boundary.

Everything an attacker could have written passes through here before any
model sees it. Nothing else in the codebase is allowed to hand untrusted
text to an LLM.

Two jobs:
  1. Clean the text — strip the tricks used to hide instructions
  2. Detect an injection attempt, and RAISE IT AS AN ALERT

The second is the interesting one. A legitimate filename does not contain
instructions addressed to an AI. Finding one means the adversary knows the
defender is running AI tooling, which describes a more capable attacker —
so the attempt is evidence, not noise to be filtered away.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

from app.config import MAX_UNTRUSTED_LEN

# ── characters used to hide instructions ────────────────────────────────
ZERO_WIDTH = dict.fromkeys(map(ord, "​‌‍⁠﻿"))
BIDI = dict.fromkeys(map(ord, "‪‫‬‭‮"
                              "⁦⁧⁨⁩"))

# ── the two attack classes that actually work ───────────────────────────
# Direct override ("ignore previous instructions") and base64 payloads both
# measure 0% against current models. We deliberately do not test for them —
# defending an attack that already fails is a waste, and it signals that the
# team is working from outdated material.

AUTHORITY = re.compile(
    r"\[\s*(soc|security|admin|administrator|system|analyst|ops|it)"
    r"[^\]]{0,30}\]\s*:?",
    re.I,
)
DIRECTIVE = re.compile(
    r"\b(ignore|disregard|mark|classify|treat|whitelist|suppress|override)\b"
    r".{0,40}\b(benign|safe|normal|authoris|authoriz|approved|clean)\w*",
    re.I,
)
STRUCTURAL = re.compile(
    r"(</?\s*(log|logs|event|entry|record|context)\s*>"
    r"|\b(final|verdict|conclusion|end\s+of\s+logs?|assessment)\s*[:=])",
    re.I,
)

REDACTION = "[REDACTED-INJECTION]"


@dataclass
class InjectionFinding:
    event_id: str
    field: str
    attack_class: str        # persona_hijack | directive | context_manipulation
    matched: str

    def as_alert_payload(self) -> dict:
        return {
            "rule_id": "INJECTION_ATTEMPT",
            "rule_title": f"Prompt injection attempt in {self.field}",
            "severity": "high",
            "technique": "T1565",          # data manipulation
            "tactic": "TA0040",
            "detail": {"field": self.field, "class": self.attack_class,
                       "matched": self.matched[:120]},
        }


@dataclass
class CleanItem:
    event_id: str
    field: str
    original: str
    clean: str
    finding: InjectionFinding | None = None


def sanitise_text(field: str, raw: str) -> str:
    """Strip the hiding tricks, normalise, truncate."""
    if not raw:
        return ""
    s = unicodedata.normalize("NFKC", raw)          # collapse lookalikes
    s = s.translate(ZERO_WIDTH).translate(BIDI)     # invisible + direction marks
    s = "".join(c for c in s if c == "\t" or ord(c) >= 0x20)
    s = re.sub(r"\s+", " ", s).strip()
    return s[: MAX_UNTRUSTED_LEN.get(field, 200)]


def detect_injection(event_id: str, field: str, clean: str
                     ) -> InjectionFinding | None:
    for name, pattern in (("persona_hijack", AUTHORITY),
                          ("directive", DIRECTIVE),
                          ("context_manipulation", STRUCTURAL)):
        if m := pattern.search(clean):
            return InjectionFinding(event_id, field, name, m.group(0))
    return None


def process(event_id: str, untrusted: dict[str, str | None]) -> list[CleanItem]:
    """Clean one event's untrusted map and flag anything suspicious."""
    items: list[CleanItem] = []
    for field, raw in (untrusted or {}).items():
        if not raw:
            continue
        clean = sanitise_text(field, raw)
        finding = detect_injection(event_id, field, clean)
        if finding:
            # replace only the matched span — keep the surrounding context,
            # which is often genuinely useful evidence
            clean = clean.replace(finding.matched, REDACTION)
        items.append(CleanItem(event_id, field, raw, clean, finding))
    return items


def datamark(text: str, marker: str = "⁣") -> str:
    """Interleave an invisible marker so the model can tell data from
    instruction at token level. Measurably stronger than delimiters alone."""
    return marker.join(text.split(" "))


def prepare_context(events: list) -> tuple[list[dict], list[InjectionFinding]]:
    """Full boundary pass over an incident's events.

    Returns the marked context blocks safe to give a model, plus every
    injection finding so the caller can raise alerts for them.
    """
    context: list[dict] = []
    findings: list[InjectionFinding] = []

    for ev in events:
        for item in process(ev.event_id, ev.untrusted):
            if item.finding:
                findings.append(item.finding)
            context.append({
                "event_id": item.event_id,
                "field": item.field,
                "value": datamark(item.clean),
            })

    return context, findings
