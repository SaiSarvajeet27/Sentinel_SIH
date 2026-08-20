"""Central configuration.

Everything tunable lives here. Nothing else reads os.environ directly.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv

# override=True: .env is the documented single source of truth for this
# project ("fill in the two keys, nothing else needs changing"), but
# load_dotenv()'s default leaves an existing shell/OS environment variable
# in place. A stale GROQ_API_KEY or GEMINI_API_KEY left over in a shell
# profile then silently shadows whatever the .env file says, with no
# error — the key still "works" as a string, just authenticates as the
# wrong account. Rotating a key in .env should actually take effect.
load_dotenv(override=True)

ROOT = Path(__file__).resolve().parent.parent

# ── Database ────────────────────────────────────────────────────────────
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://sentinel:sentinel@localhost:5432/sentinel",
)

# ── LLM providers ───────────────────────────────────────────────────────
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:7b")

Provider = Literal["gemini", "groq", "ollama", "off"]

# Observed free-tier limits, because Google no longer publishes a fixed
# table — they vary per project and are shown at
# https://aistudio.google.com/rate-limit
#
# The defaults here are deliberately pessimistic. Check yours and raise
# them; the cost of guessing low is a slower demo, the cost of guessing
# high is a 429 on camera.
GEMINI_RPM = int(os.getenv("GEMINI_RPM", "8"))
GEMINI_RPD = int(os.getenv("GEMINI_RPD", "180"))

# Groq's published free-tier numbers are more generous and more stable than
# Gemini's per-project ones, which is why the task routing below leans on
# it for anything that repeats. Still conservative on purpose — see the
# note on GEMINI_RPM above.
GROQ_RPM = int(os.getenv("GROQ_RPM", "25"))
GROQ_RPD = int(os.getenv("GROQ_RPD", "900"))

# Which provider handles which task. Set all to "ollama" for offline.
# Every entry here is a real call site. `both_sides`, `rationale` and
# `title` used to be listed and were never routed anywhere — they are fields
# inside the batched `explain` call, not separate tasks. Config that
# advertises knobs which are not connected to anything is worse than no
# config, because someone eventually sets one and wonders why nothing
# happened.
TASK_PROVIDER: dict[str, Provider] = {
    # Runs once per demo run, so it can afford Gemini's tighter quota — and
    # Gemini's own project isolation makes it a natural fit for the one
    # task that's pure fiction rather than a read of real telemetry.
    "scenario":   os.getenv("LLM_SCENARIO", "gemini"),    # type: ignore
    # Everything below repeats — once or more per incident — so it's on
    # Groq, whose free tier is both larger and a fixed published number
    # rather than a per-project Gemini allocation that can be as low as
    # 20 requests/day.
    "explain":    os.getenv("LLM_EXPLAIN", "groq"),       # type: ignore
    # the AI writes the remediation plan; policy still sets the tier
    "remediation": os.getenv("LLM_REMEDIATION", "groq"),  # type: ignore
    # ── the AI assists the deterministic core ───────────────────────────
    # It reviews what the rules missed, proposes links the graph could not
    # bridge, and argues for a bounded score adjustment. In all three it
    # proposes; the rules, the graph and the clamp still decide.
    "triage":     os.getenv("LLM_TRIAGE", "groq"),        # type: ignore
    "correlate":  os.getenv("LLM_CORRELATE", "groq"),     # type: ignore
    # `score` overlaps with `assess` below — one asks the model to adjust a
    # number it has been shown, the other asks it for its own. The blind
    # one is strictly better evidence, so when dual path is on this is
    # switched off by default rather than spending a request twice on the
    # same question.
    "score":      os.getenv("LLM_SCORE", "off"),          # type: ignore
    # ── the second analyst ──────────────────────────────────────────────
    # These two run blind: the model is not told what the rules found or
    # what the arithmetic scored, because a second opinion that has already
    # seen the first is not a second opinion.
    "analysis":   os.getenv("LLM_ANALYSIS", "groq"),      # type: ignore
    "assess":     os.getenv("LLM_ASSESS", "groq"),        # type: ignore
}

AI_ENABLED = os.getenv("AI_ENABLED", "true").lower() == "true"

# ── Authentication ──────────────────────────────────────────────────────
# There is no demo mode. Every API route requires a bearer token, every
# mutating route checks a role, and the role comes from a signed token
# rather than from the request body. There used to be a DEMO_MODE bypass
# that skipped all of it; the honest answer to "what stops an analyst
# approving a tier-3 action" has to be "the token says they cannot", and a
# bypass sitting next to that answer makes it untrue.
#
# The signing secret is generated and persisted on first run if you do not
# supply one, so the application is secure by default rather than secure
# only if you remember to configure it.
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = int(os.getenv("ACCESS_TOKEN_MINUTES", "480"))
_SECRET_PATH = ROOT / "db" / "jwt_secret.key"


def _load_or_create_secret() -> str:
    supplied = os.getenv("JWT_SECRET_KEY", "").strip()
    if supplied:
        return supplied
    if _SECRET_PATH.exists():
        return _SECRET_PATH.read_text(encoding="utf-8").strip()
    import secrets
    value = secrets.token_urlsafe(48)
    _SECRET_PATH.parent.mkdir(parents=True, exist_ok=True)
    _SECRET_PATH.write_text(value, encoding="utf-8")
    try:                                    # best effort on POSIX
        _SECRET_PATH.chmod(0o600)
    except OSError:
        pass
    return value


JWT_SECRET_KEY = _load_or_create_secret()

# ── App ─────────────────────────────────────────────────────────────────
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

# ── Simulation ──────────────────────────────────────────────────────────
SIM_HOSTS = int(os.getenv("SIM_HOSTS", 12))
SIM_USERS = int(os.getenv("SIM_USERS", 25))

# Runs a full attack scenario (fresh Gemini-authored plan → real detection →
# real dual-path AI analysis → real remediation proposal) on its own, on a
# timer, so the SOC has live incidents without anyone clicking a "demo" Play
# button. Each cycle spends exactly one Gemini call — at the default 90
# minutes that is 16 cycles/day, comfortably under a typical ~20/day Gemini
# free-tier project quota. Lower this and you may exhaust that quota before
# the day is over; raise it if new incidents feel too infrequent.
AUTO_GENERATE_ENABLED = os.getenv("AUTO_GENERATE_ENABLED", "true").lower() == "true"
AUTO_GENERATE_INTERVAL_MINUTES = int(os.getenv("AUTO_GENERATE_INTERVAL_MINUTES", 90))

# ── Correlation tuning ──────────────────────────────────────────────────
CLUSTER_HOP_BUDGET = 3.0        # weighted path cost, not hop count
CLUSTER_WINDOW_MIN = 60         # sliding, measured from the latest alert
HUB_PERCENTILE = 95             # nodes above this are excluded as bridges

# Relationship strength. Low = strong link. Used as path weight.
EDGE_WEIGHT = {
    "executed":      1.0,
    "logged_into":   1.0,
    "spawned":       1.0,
    "accessed_file": 1.5,
    "sent_email":    1.5,
    "connected_to":  2.0,
    "dns_query":     3.0,
}

# ── Scoring ─────────────────────────────────────────────────────────────
# Seven canonical stages. ATT&CK has fourteen tactics; we collapse them.
# Defined ONCE so the dashboard and detail page can never disagree.
CANONICAL_STAGES: list[tuple[str, list[str]]] = [
    ("initial_access",    ["TA0001"]),
    ("execution",         ["TA0002"]),
    ("persistence",       ["TA0003", "TA0004"]),
    ("evasion",           ["TA0005"]),
    ("credential_access", ["TA0006", "TA0007"]),
    ("lateral_movement",  ["TA0008", "TA0009"]),
    ("impact",            ["TA0010", "TA0011", "TA0040"]),
]

# Score by how far through the lifecycle, not by summing severities.
KILLCHAIN_CURVE = {0: 5, 1: 12, 2: 25, 3: 40, 4: 55, 5: 70, 6: 85, 7: 95}

# Techniques that are critical on their own, regardless of breadth.
CRITICAL_ALONE = {"T1486", "T1490", "T1003.001", "T1078.004"}
CRITICAL_FLOOR = 75

# ── Response tiers ──────────────────────────────────────────────────────
# Declared in advance — this is what "pre-approved" means in the statement.
TIERS: dict[str, int] = {
    "collect_forensics":       0,
    "snapshot_host":           0,
    "enrich_indicator":        0,
    "notify_analyst":          0,
    "quarantine_email":        1,
    "block_hash":              1,
    "force_reauth":            1,
    "revoke_session":          1,
    "suspend_account":         2,   # named in the problem statement
    "isolate_host":            2,   # named in the problem statement
    "block_domain":            2,
    "mass_isolate":            3,
    "disable_service_account": 3,
}

# How long an executed action stays reversible. None = always.
ROLLBACK_WINDOW_HOURS: dict[str, int | None] = {
    "isolate_host":     24,
    "suspend_account":  72,
    "quarantine_email": None,
    "block_hash":       168,
    "block_domain":     24,
}

AUTONOMY_MODES = {
    "always_ask":     {"auto_max": -1, "label": "Always ask"},
    "recommend_only": {"auto_max": -1, "label": "Recommend only"},
    "act_and_notify": {"auto_max":  1, "label": "Act and notify"},
    "full_auto":      {"auto_max":  3, "label": "Full auto", "enabled": False},
}
DEFAULT_AUTONOMY = "act_and_notify"

TECHNIQUE_CATEGORY = {
    "T1566.001": "security", "T1204.002": "security",
    "T1059.001": "security", "T1053.005": "maintenance",
    "T1003.001": "access",   "T1078": "access", "T1087.002": "access",
    "T1021.002": "access",   "T1490": "security", "T1486": "security",
    "T1071.001": "security", "T1565": "security",
}

# Roles and what each may do.
ROLE_PERMISSIONS = {
    "analyst":        {"approve_tier_2": False, "approve_tier_3": False,
                       "retire_rules": False, "change_settings": False},
    "senior_analyst": {"approve_tier_2": True,  "approve_tier_3": False,
                       "retire_rules": True,  "change_settings": True},
    "manager":        {"approve_tier_2": True,  "approve_tier_3": True,
                       "retire_rules": True,  "change_settings": True},
}

# ── AI guardrails ───────────────────────────────────────────────────────
MAX_UNTRUSTED_LEN = {
    "filename": 200, "email_subject": 200, "email_body": 1000,
    "cmdline": 500, "user_agent": 200, "dns_query": 253, "auth_user": 64,
}

NARRATIVE_RISK_THRESHOLD = 30   # don't spend tokens on trivial incidents
FEEDBACK_RATE_LIMIT = 20        # per analyst per 10 minutes

# ── Alert flooding ──────────────────────────────────────────────────────
# Generating a lot of harmless alerts to bury one real one is an old
# technique and it works, because the analyst stops reading. If the rate
# jumps this far above the running baseline we say so out loud rather than
# quietly rendering four hundred rows.
FLOOD_MULTIPLIER = 8            # alerts above baseline × this = a flood
FLOOD_MIN_ALERTS = 25           # below this, any rate is just a quiet day

# ══════════════════════════════════════════════════════════════════════
#  AI ASSIST — the bounds on what the model may change
#
#  The model now helps with detection, chain detection and scoring. In all
#  three it *proposes*. These numbers are the reason that is safe, and they
#  are here, in policy, rather than in a prompt — a prompt can be argued
#  with, a clamp cannot.
# ══════════════════════════════════════════════════════════════════════

# ── Detection assist ────────────────────────────────────────────────────
# The model never sees the raw stream. A deterministic anomaly filter picks
# the candidates; the model only reviews events that filter already found
# odd AND that no rule matched.
TRIAGE_CANDIDATES_MAX = 40      # how many oddities go into one call
TRIAGE_CALLS_PER_RUN = 1        # hard ceiling, so a long demo cannot drift
TRIAGE_MIN_ODDITY = 2           # an event needs 2 independent oddities

# An AI-raised alert can never be more than this. Only a written rule may
# call something critical, because only a rule can be audited beforehand.
TRIAGE_MAX_SEVERITY = "medium"
TRIAGE_MIN_CONFIDENCE = 0.55

# The only techniques the model may name. Anything else is discarded.
TECHNIQUE_CATALOGUE = {
    "T1566.001": ("Phishing attachment", "TA0001"),
    "T1078":     ("Valid accounts", "TA0008"),
    "T1078.004": ("Cloud account abuse", "TA0008"),
    "T1059.001": ("PowerShell execution", "TA0002"),
    "T1053.005": ("Scheduled task persistence", "TA0003"),
    "T1003.001": ("Credential dumping from LSASS", "TA0006"),
    "T1087.002": ("Domain account discovery", "TA0007"),
    "T1021.002": ("SMB admin share access", "TA0008"),
    "T1071.001": ("Command and control over web protocols", "TA0011"),
    "T1048":     ("Exfiltration over an alternative protocol", "TA0010"),
    "T1490":     ("Inhibit system recovery", "TA0040"),
    "T1486":     ("Data encrypted for impact", "TA0040"),
    "T1562.001": ("Impair defences", "TA0005"),
    "T1112":     ("Registry modification", "TA0005"),
}

# ── Chain-detection assist ──────────────────────────────────────────────
# A proposed link must survive this gate before an analyst is even shown it.
AI_LINK_WINDOW_MIN = 240        # incidents further apart than this cannot link
AI_LINK_MIN_CONFIDENCE = 0.6
AI_LINK_MAX_PROPOSALS = 5
# A link the model proposes is never applied on its own. Merging two
# incidents changes what the analyst is looking at, so a human does it.
AI_LINK_AUTO_APPLY = False

# ── Scoring assist ──────────────────────────────────────────────────────
# Asymmetric on purpose. A model that has been talked into "this is fine"
# can move a score down by ten points. It cannot dismiss anything.
AI_SCORE_MAX_UP = 15.0
AI_SCORE_MAX_DOWN = 10.0
# And it cannot cross this at all: if a technique in CRITICAL_ALONE is
# present, no amount of reasoning may take the score below the floor.
AI_SCORE_RESPECTS_CRITICAL_FLOOR = True
AI_SCORE_MIN_RISK = 25          # below this, not worth a call

# ══════════════════════════════════════════════════════════════════════
#  DUAL-PATH ANALYSIS
#
#  Two analysts look at the same events. One is a set of rules and a graph,
#  the other is a language model. Neither is told what the other concluded.
#
#  Then we compare. Three things follow from that, and they are the whole
#  design:
#
#    1. We act on whichever is MORE worried. This is how dual-sensor safety
#       systems work — you do not average two altimeters, you believe the
#       lower one. It also means the model is genuinely equal in its ability
#       to escalate and structurally unable to dismiss.
#
#    2. Agreement is evidence. Two independent methods reaching the same
#       verdict is worth more than either of them alone, and we say so.
#
#    3. DISAGREEMENT IS ITSELF A FINDING. If the rules say 20 and the model
#       says 85, that is not a low-risk incident. It is an incident nobody
#       understands, and a human should look at it regardless of score.
# ══════════════════════════════════════════════════════════════════════

DUAL_PATH_ENABLED = os.getenv("DUAL_PATH", "true").lower() == "true"

# How far above the deterministic score the model's own assessment may
# carry the final number. It can escalate — that is the point — but not
# without limit, or a single confused response could mark everything
# critical and the gate would stop meaning anything.
AI_MAX_ESCALATION = 25.0

# Band distance at which the two verdicts count as disagreeing.
# 1 band apart is a difference of emphasis. 2 is a different conclusion.
DISAGREEMENT_BANDS = 2
DISAGREEMENT_POINTS = 30.0      # or this far apart numerically

# An incident where the two paths disagree is forced into human review even
# if both scores are low. Set false only if you want to argue that nobody
# understanding an incident is an acceptable reason not to look at it.
DISAGREEMENT_FORCES_REVIEW = True

# The model's analysis pass sees a digest of the window rather than raw
# events — the same way an analyst reads a shift handover.
ANALYSIS_WINDOW_EVENTS = 400    # events summarised per pass
ANALYSIS_DETAIL_EVENTS = 25     # of those, shown in full
ANALYSIS_CALLS_PER_RUN = 2
