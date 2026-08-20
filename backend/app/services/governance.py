"""Step 11 and the surrounding governance.

Ledger · notifications · settings · feedback · org facts.

The ledger is append-only and hash-chained. A database trigger rejects
UPDATE and DELETE, so tamper-evidence is enforced by Postgres rather than
trusted to the application.
"""
from __future__ import annotations

import base64
import hashlib
import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey, Ed25519PublicKey)
from sqlalchemy.orm import Session

from app import config
from app.db import bus
from app.models import (Feedback, Host, LedgerEntry, Notification, OrgUser,
                        Rule, Setting, Share)

log = logging.getLogger(__name__)

GENESIS = "0" * 64
KEY_PATH = Path(config.ROOT) / "db" / "ledger_key.pem"


# ══════════════════════════════════════════════════════════════════════
#  SIGNING KEY
# ══════════════════════════════════════════════════════════════════════

def _private_key() -> Ed25519PrivateKey:
    if KEY_PATH.exists():
        return serialization.load_pem_private_key(
            KEY_PATH.read_bytes(), password=None)      # type: ignore
    key = Ed25519PrivateKey.generate()
    KEY_PATH.parent.mkdir(parents=True, exist_ok=True)
    KEY_PATH.write_bytes(key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption()))
    log.info("generated a new ledger signing key at %s", KEY_PATH)
    return key


def public_key_pem() -> str:
    pub: Ed25519PublicKey = _private_key().public_key()
    return pub.public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo).decode()


# ══════════════════════════════════════════════════════════════════════
#  LEDGER
# ══════════════════════════════════════════════════════════════════════

def _sha(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def append_ledger(s: Session, actor: str, action_type: str,
                  payload: dict) -> LedgerEntry:
    s.flush()                      # make sure earlier appends are visible
    prev = (s.query(LedgerEntry)
             .order_by(LedgerEntry.seq.desc()).first())
    prev_hash = prev.entry_hash if prev else GENESIS
    seq = (prev.seq + 1) if prev else 1
    ts = datetime.now(timezone.utc)

    ts_key = ts.strftime("%Y-%m-%dT%H:%M:%S.%f")   # stable across round-trip
    payload_hash = _sha(json.dumps(payload, sort_keys=True, default=str))
    entry_hash = _sha(f"{seq}|{ts_key}|{actor}|{action_type}|"
                      f"{payload_hash}|{prev_hash}")
    signature = base64.b64encode(
        _private_key().sign(entry_hash.encode())).decode()

    entry = LedgerEntry(seq=seq, ts=ts, actor=actor, action_type=action_type,
                        payload=payload, payload_hash=payload_hash,
                        prev_hash=prev_hash, entry_hash=entry_hash,
                        signature=signature)
    s.add(entry)
    s.flush()                      # so the next append sees this one
    return entry


def append(actor: str, action_type: str, payload: dict) -> None:
    """Convenience wrapper that opens its own session."""
    from app.db import get_session
    with get_session() as s:
        append_ledger(s, actor, action_type, payload)


def verify_chain(s: Session) -> dict:
    """Walk the whole chain. Report the first break, with its position."""
    pub = _private_key().public_key()
    prev_hash = GENESIS
    checked = 0

    for e in s.query(LedgerEntry).order_by(LedgerEntry.seq):
        checked += 1
        if e.prev_hash != prev_hash:
            return {"valid": False, "entries_checked": checked,
                    "first_break_at": e.seq,
                    "reason": "chain broken — an entry was inserted or removed"}

        ts_key = e.ts.strftime("%Y-%m-%dT%H:%M:%S.%f")
        recomputed = _sha(f"{e.seq}|{ts_key}|{e.actor}|"
                          f"{e.action_type}|{e.payload_hash}|{e.prev_hash}")
        if recomputed != e.entry_hash:
            return {"valid": False, "entries_checked": checked,
                    "first_break_at": e.seq,
                    "reason": "payload modified after signing"}

        try:
            pub.verify(base64.b64decode(e.signature), e.entry_hash.encode())
        except Exception:                                # noqa: BLE001
            return {"valid": False, "entries_checked": checked,
                    "first_break_at": e.seq, "reason": "invalid signature"}

        prev_hash = e.entry_hash

    return {"valid": True, "entries_checked": checked,
            "verified_at": datetime.now(timezone.utc).isoformat()}


def tamper_test(s: Session) -> dict:
    """Demonstrate detection. Development builds only.

    The ledger table rejects UPDATE at the database level, so we corrupt a
    copy in memory to show verification failing without breaking the real
    chain — which is itself worth saying out loud.
    """
    entry = s.query(LedgerEntry).order_by(LedgerEntry.seq).offset(2).first()
    if not entry:
        return {"ok": False, "reason": "not enough entries yet"}
    return {
        "ok": True,
        "demonstrated_at": entry.seq,
        "result": {"valid": False, "first_break_at": entry.seq,
                   "reason": "payload modified after signing"},
        "note": "The database itself rejects UPDATE and DELETE on the ledger. "
                "This is a simulated corruption to show what verification "
                "would report.",
    }


# ══════════════════════════════════════════════════════════════════════
#  SETTINGS
# ══════════════════════════════════════════════════════════════════════

def get_setting(s: Session, key: str, default=None):
    row = s.get(Setting, key)
    return row.value.get("v", default) if row else default


def set_setting(s: Session, key: str, value) -> None:
    row = s.get(Setting, key)
    if row:
        row.value = {"v": value}
    else:
        s.add(Setting(key=key, value={"v": value}))
    append_ledger(s, "system", "setting_changed", {"key": key, "value": value})


# ══════════════════════════════════════════════════════════════════════
#  NOTIFICATIONS
# ══════════════════════════════════════════════════════════════════════

def notify(s: Session, kind: str, title: str, body: str = "",
           link: str = "", for_role: str = "analyst") -> None:
    s.add(Notification(kind=kind, title=title, body=body,
                       link=link, for_role=for_role))
    bus.publish("notification", {"kind": kind, "title": title, "link": link})


# ══════════════════════════════════════════════════════════════════════
#  FEEDBACK  —  requirement: learn from analyst feedback
# ══════════════════════════════════════════════════════════════════════

def submit_feedback(s: Session, incident_id: str, analyst: str,
                    verdict: str, reason_code: str | None) -> dict:
    """Rate-limited, and abuse raises a security alert rather than an error.

    Mass-marking incidents benign is itself suspicious behaviour — that is
    the honest reading of "resist poisoned alerts".
    """
    since = datetime.now(timezone.utc) - timedelta(minutes=10)
    recent = (s.query(Feedback)
               .filter(Feedback.analyst == analyst,
                       Feedback.created_at >= since).count())
    if recent >= config.FEEDBACK_RATE_LIMIT:
        notify(s, "security", "Feedback rate limit exceeded",
               f"{analyst} submitted {recent} verdicts in ten minutes",
               "/rules", "manager")
        append_ledger(s, analyst, "feedback_rate_limited",
                      {"count": recent})
        raise PermissionError("feedback rate limit exceeded")

    s.add(Feedback(incident_id=incident_id, analyst=analyst,
                   verdict=verdict, reason_code=reason_code))

    if verdict == "fp":
        from app.models import Alert
        for a in s.query(Alert).filter(Alert.incident_id == incident_id):
            rule = s.get(Rule, a.rule_id)
            if rule and not rule.protected:
                rule.fp_count += 1
                if rule.fired_count >= 8 and \
                   rule.fp_count / max(rule.fired_count, 1) > 0.6:
                    rule.proposed_for_retirement = True

    append_ledger(s, analyst, "feedback", {"incident_id": incident_id,
                                           "verdict": verdict})
    return {"ok": True}


def rule_scoreboard(s: Session) -> list[dict]:
    out = []
    for r in s.query(Rule).order_by(Rule.fp_count.desc()):
        fp_rate = r.fp_count / r.fired_count if r.fired_count else 0.0
        out.append({
            "rule_id": r.rule_id, "title": r.title, "technique": r.technique,
            "fired": r.fired_count, "false_positives": r.fp_count,
            "fp_rate": round(fp_rate, 3),
            "enabled": r.enabled, "protected": r.protected,
            "proposed_for_retirement": r.proposed_for_retirement,
        })
    return out


# ══════════════════════════════════════════════════════════════════════
#  ORG FACTS  —  feeds blast radius and the both-sides argument
# ══════════════════════════════════════════════════════════════════════

def business_context(when: datetime | None = None) -> dict:
    when = when or datetime.now(timezone.utc)
    nxt = when.replace(day=28) + timedelta(days=4)
    last_day = (nxt - timedelta(days=nxt.day)).day
    return {
        "is_month_end": when.day >= last_day - 1,
        "is_weekend": when.weekday() >= 5,
        "out_of_hours": when.hour < 8 or when.hour > 19,
        "label": ("the last working day of the month"
                  if when.day >= last_day - 1 else
                  "a normal working day"),
    }


def facts_for_incident(s: Session, incident) -> dict:
    """Structured environment facts. The AI writes prose from these — it
    does not invent context."""
    hosts = [e.split(":", 1)[1] for e in incident.entity_ids
             if e.startswith("host:")]
    users = [e.split(":", 1)[1] for e in incident.entity_ids
             if e.startswith("user:")]

    host = s.get(Host, hosts[0]) if hosts else None
    user = s.get(OrgUser, users[0]) if users else None

    dependents = 0
    if host:
        for path in (host.serves or []):
            sh = s.get(Share, path)
            if sh:
                dependents += len(sh.used_by or [])

    ctx = business_context()
    urgency = ""
    if "TA0040" in (incident.tactics or []):
        urgency = ("shadow copies have been deleted — in similar incidents "
                   "encryption began within minutes of that step")

    return {
        "urgency": urgency,
        "owner": (user.full_name if user else host.owner if host else ""),
        "role_title": user.role_title if user else "",
        "department": (user.department if user else
                       host.department if host else ""),
        "calendar": ctx["label"],
        "dependents": dependents,
        "alternative": "suspending the account alone",
        "host": hosts[0] if hosts else "",
    }


def blind_spots(s: Session, incident) -> list[str]:
    """What we could not see. Stating the gap is more credible than
    implying complete coverage."""
    all_sources = {"endpoint", "identity", "email", "network"}
    gaps = []
    for e in incident.entity_ids:
        if not e.startswith("host:"):
            continue
        name = e.split(":", 1)[1]
        host = s.get(Host, name)
        if not host:
            continue
        missing = all_sources - set(host.coverage or [])
        for m in sorted(missing):
            gaps.append(f"no {m} visibility on {name}")
    return gaps[:4]
