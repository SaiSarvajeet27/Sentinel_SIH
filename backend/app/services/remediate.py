"""Step 8 — the AI proposes the fix.

The model reads the incident and writes a remediation plan: which steps, in
what order, and why. That is real authorship — it is not picking from a
lookup table, and two similar incidents can get different plans if the
circumstances differ.

**But it proposes into a constrained vocabulary, and it cannot set its own
privileges.** Three things stay outside its reach:

    1. It can only name actions from a fixed list. An invented action is
       rejected, not executed.
    2. The RISK TIER is looked up from policy, never proposed. The model
       cannot say "this one is low risk, run it automatically".
    3. The BLAST RADIUS is computed from the graph, never written.

So the fix is genuinely the AI's. The question of whether that fix runs by
itself or waits for a person is not, and never becomes, the AI's to answer.

If the model is unavailable, a deterministic playbook match produces the plan
instead and the interface says so.
"""
from __future__ import annotations

import logging

from sqlalchemy.orm import Session
from ulid import ULID

from app import config
from app.llm import quota, router
from app.models import Action, Alert, Incident
from app.services import respond

log = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════════
#  THE VOCABULARY  —  the only actions the model may name
# ══════════════════════════════════════════════════════════════════════

ACTION_VOCABULARY = {
    "collect_forensics":   "Take a forensic snapshot of the affected host. "
                           "Read-only, nobody notices.",
    "snapshot_host":       "Capture full disk and memory state for later "
                           "analysis. Read-only.",
    "enrich_indicator":    "Look up an address or hash against threat "
                           "intelligence. Read-only.",
    "quarantine_email":    "Move the originating message out of every "
                           "mailbox. Reversible.",
    "block_hash":          "Prevent this specific file from executing on the "
                           "affected host. Reversible.",
    "force_reauth":        "Invalidate current tokens and require the user to "
                           "sign in again. Reversible, mildly disruptive.",
    "revoke_session":      "End the account's active sessions. Reversible.",
    "suspend_account":     "Disable the account entirely. The person cannot "
                           "work until it is restored.",
    "isolate_host":        "Cut the machine off the network. Everything on it "
                           "stops, including anything the user was doing.",
    "block_domain":        "Block a domain across the organisation. Affects "
                           "everyone, not just this incident.",
    "monitor_only":        "Take no containment action; watch and alert on "
                           "further activity.",
    "mass_isolate":        "Isolate every affected host at once. Broad and "
                           "hard to reverse.",
}

TARGET_VOCABULARY = ["affected_host", "affected_user", "source_email",
                     "sender_domain", "file_hash"]

PLAN_SCHEMA = {
    "type": "object",
    "required": ["plan", "summary"],
    "properties": {
        "summary": {"type": "string"},
        "plan": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["action", "target", "why"],
                "properties": {
                    "action": {"type": "string", "enum": list(ACTION_VOCABULARY)},
                    "target": {"type": "string", "enum": TARGET_VOCABULARY},
                    "why": {"type": "string"},
                },
            },
        },
        "not_recommended": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["action", "why_not"],
                "properties": {
                    "action": {"type": "string", "enum": list(ACTION_VOCABULARY)},
                    "why_not": {"type": "string"},
                },
            },
        },
    },
}

SYSTEM = """You are a senior security analyst recommending how to contain an
incident. Another analyst will read your plan and decide whether to carry it
out, so write for someone who has to justify the decision afterwards.

You will be given:
  VERDICT      — what was detected. Established facts.
  ENVIRONMENT  — who owns the affected machine, what depends on it, what day
                 it is. This is what makes a plan sensible or reckless.
  AVAILABLE ACTIONS — the only actions you may name.

Produce:
  summary          One sentence stating what you recommend and why.
  plan             The steps, in the order they should happen. Start with
                   anything that preserves evidence, then containment.
                   For each: the action, its target, and one sentence on why
                   it follows from what was detected.
  not_recommended  1-2 actions you considered and rejected, with the reason.

Rules:
1. Only name actions from AVAILABLE ACTIONS. Anything else is discarded.
2. Do NOT state whether a step should run automatically, or how risky it is.
   That is decided by policy, not by you.
3. Weigh the environment. Isolating the machine of someone mid-deadline is
   not free, and if a narrower action would do, prefer it and say so.
4. Do not invent facts. Everything comes from VERDICT and ENVIRONMENT.

Return JSON only."""


# ══════════════════════════════════════════════════════════════════════
#  PROPOSE
# ══════════════════════════════════════════════════════════════════════

def propose(s: Session, incident: Incident, facts: dict) -> dict:
    """Ask the model for a plan. Returns a validated proposal."""

    techniques = sorted({a.technique for a in
                         s.query(Alert).filter(
                             Alert.incident_id == incident.incident_id)
                         if a.technique})

    key = quota.cache_key("remediation", {
        "techniques": techniques,
        "entities": incident.entity_ids,
        "risk": round(incident.risk_score),
        "dependents": facts.get("dependents", 0),
    })
    if hit := quota.cached(key):
        return {**hit, "cached": True}

    result = router.ask(
        task="remediation",
        system=SYSTEM,
        user=_render(incident, facts, techniques),
        json_schema=PLAN_SCHEMA,
        max_tokens=900,
    )

    if not result.ok:
        return _fallback(s, incident, result.status)

    proposal = _validate(result.data or {})
    proposal.update({
        "source": "ai",
        "provider": result.provider,
        "model": result.model,
        "cached": False,
    })
    quota.store(key, proposal)
    return proposal


def _render(incident: Incident, facts: dict, techniques: list[str]) -> str:
    lines = [
        "=== VERDICT ===",
        f"Risk score: {incident.risk_score:.0f} "
        f"({sum(incident.stages or [])} of 7 attack stages)",
        f"Techniques observed: {', '.join(techniques) or 'none'}",
        f"Attack stages: {', '.join(incident.tactics or [])}",
        f"Entities: {', '.join(incident.entity_ids or [])}",
    ]
    if incident.injection_detected:
        lines.append("An attempt was made to manipulate our analysis tooling "
                     "through log content. It was blocked.")

    lines += ["", "=== ENVIRONMENT ==="]
    for label, key in (("Affected machine", "host"),
                       ("Owner", "owner"),
                       ("Their role", "role_title"),
                       ("Department", "department"),
                       ("Today is", "calendar"),
                       ("People depending on this machine", "dependents"),
                       ("Time pressure", "urgency"),
                       ("Not monitored", "blind_spots")):
        v = facts.get(key)
        if v:
            lines.append(f"{label}: {v}")

    lines += ["", "=== AVAILABLE ACTIONS ==="]
    for kind, desc in ACTION_VOCABULARY.items():
        lines.append(f"  {kind}: {desc}")

    return "\n".join(lines)


def _validate(data: dict) -> dict:
    """Discard anything outside the vocabulary. The model cannot invent an
    action, and we count what we dropped rather than hiding it."""
    steps, dropped = [], 0

    for i, item in enumerate((data.get("plan") or [])[:8]):
        action = (item or {}).get("action")
        target = (item or {}).get("target")
        if action not in ACTION_VOCABULARY or target not in TARGET_VOCABULARY:
            dropped += 1
            log.warning("discarded proposed action outside vocabulary: %r",
                        action)
            continue
        steps.append({
            "order": len(steps) + 1,
            "action": action,
            "target": target,
            "why": str(item.get("why", ""))[:240],
        })

    rejected = []
    for item in (data.get("not_recommended") or [])[:3]:
        if (item or {}).get("action") in ACTION_VOCABULARY:
            rejected.append({"action": item["action"],
                             "why_not": str(item.get("why_not", ""))[:240]})

    return {
        "summary": str(data.get("summary", ""))[:300],
        "steps": steps,
        "not_recommended": rejected,
        "dropped_steps": dropped,
    }


def _fallback(s: Session, incident: Incident, status: str) -> dict:
    """Deterministic playbook match. Labelled, so the interface can say the
    plan was not written by the model."""
    books = respond.match_playbooks(incident)
    steps = []
    if books:
        for kind, target in books[0]["steps"]:
            steps.append({
                "order": len(steps) + 1,
                "action": kind,
                "target": target,
                "why": "Standard step in the matched playbook.",
            })
    return {
        "summary": (f"Matched playbook: {books[0]['name']}."
                    if books else "No playbook matched this incident."),
        "steps": steps,
        "not_recommended": [],
        "dropped_steps": 0,
        "source": "playbook",
        "reason": "ai_disabled" if status == "disabled" else "ai_unavailable",
        "cached": False,
    }


# ══════════════════════════════════════════════════════════════════════
#  MATERIALISE  —  proposal → Action rows, with policy applied
# ══════════════════════════════════════════════════════════════════════

def materialise(s: Session, incident: Incident, proposal: dict) -> list[Action]:
    """Turn the proposal into real actions.

    This is where the model's authorship ends. Tier comes from policy,
    blast radius from the graph, and the reversibility rule from the model
    definition — none of the three can be influenced by what was proposed.
    """
    existing = {a.kind for a in s.query(Action).filter(
        Action.incident_id == incident.incident_id)}
    created: list[Action] = []

    for step in proposal.get("steps", []):
        kind = step["action"]
        if kind in existing or kind == "monitor_only":
            continue

        target = respond._resolve(step["target"], incident, s)
        if not target:
            continue

        tier = config.TIERS.get(kind, 2)          # policy, not proposal
        rollback = respond._rollback_for(kind, target)
        if tier <= 1 and rollback is None:
            log.warning("skipping %s: tier %s has no rollback plan", kind, tier)
            continue

        hours = config.ROLLBACK_WINDOW_HOURS.get(kind)
        from datetime import datetime, timedelta, timezone

        action = Action(
            action_id=f"act_{str(ULID()).lower()}",
            incident_id=incident.incident_id,
            kind=kind,
            target=target,
            tier=tier,
            blast_radius=respond.blast_radius(s, kind, target, incident),
            rollback=rollback,
            rollback_expires_at=(datetime.now(timezone.utc) +
                                 timedelta(hours=hours)) if hours else None,
            rationale=step.get("why", ""),
            status="pending",
        )
        s.add(action)
        created.append(action)

    s.flush()
    return created


def build_and_gate(s: Session, incident: Incident, facts: dict) -> dict:
    """The full step 8→9 path: propose, materialise, then gate.

    Reversible steps run. Anything that stops someone working waits for a
    named human who is shown what the AI proposed, why, and what it costs.
    """
    proposal = propose(s, incident, facts)
    actions = materialise(s, incident, proposal)
    respond.execute_auto(s, actions)

    return {
        "proposal": proposal,
        "actions": [
            {
                "action_id": a.action_id,
                "kind": a.kind,
                "label": respond.ACTION_LABELS.get(a.kind, a.kind),
                "target": a.target,
                "tier": a.tier,
                "status": a.status,
                "why": a.rationale,
                "blast_radius": a.blast_radius,
                "reversible": a.rollback is not None,
                "needs_approval": a.status == "pending",
            }
            for a in actions
        ],
        "awaiting_approval": sum(1 for a in actions if a.status == "pending"),
        "auto_executed": sum(1 for a in actions if a.status == "executed"),
    }
