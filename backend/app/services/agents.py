"""The Multi-Agent Transparency Pipeline.

    Detection  →  Analysis  →  Remediation

The interface presents these as three agents with a timestamped trail of what
each one did. Be precise about what that means, because it is easy to
overclaim: **these are the named stages of our pipeline, not autonomous
language-model agents.**

A model now does analytical work in all three — it reviews events the rules
missed, proposes links the graph could not walk, argues for a score
adjustment, and writes the remediation plan. In every case it proposes into
something narrower than itself, and the narrowing is what the `engine`
column records:

    "Sigma rule office_spawns_script"              a rule decided this
    "Anomaly baseline, then model review"          the model proposed it
    "Deterministic arithmetic — no model involved" the number
    "Model proposal, clamped in policy"            the adjustment to it

Every step carries `ai_assisted`, so the honest count — how much of this
incident the model touched — is a number on the screen rather than a claim
in a slide. Turning the model off and re-running produces a trail with the
same conclusions and fewer steps, which is the whole argument.
"""
from __future__ import annotations

import logging
from dataclasses import asdict, dataclass, field

from sqlalchemy.orm import Session

from app import config
from app.models import Action, Alert, CampaignLink, Event, Incident

log = logging.getLogger(__name__)

AGENTS = [
    {"id": "detection",   "name": "Detection Agent",
     "engine": "Sigma rules, then model review of what they missed",
     "colour": "cyan"},
    {"id": "analysis",    "name": "Analysis Agent",
     "engine": "Entity graph and kill-chain scoring, with a clamped "
               "model adjustment",
     "colour": "purple"},
    {"id": "remediation", "name": "Remediation Agent",
     "engine": "Model-authored plan, tier and blast radius from policy",
     "colour": "green"},
]


@dataclass
class AgentStep:
    agent: str                 # detection | analysis | remediation
    agent_name: str
    at: str                    # ISO timestamp
    action: str                # "Flagged anomalous login pattern"
    detail: str                # "14 failed logins from an unrecognised IP"
    engine: str                # what actually produced this — never a claim
    evidence: list[str] = field(default_factory=list)   # event ids
    ai_assisted: bool = False  # true only where a model wrote wording


def build(s: Session, incident: Incident) -> dict:
    """Reconstruct the trail from what the pipeline actually recorded."""
    alerts = (s.query(Alert)
               .filter(Alert.incident_id == incident.incident_id)
               .order_by(Alert.detected_at).all())
    event_ids = [e for a in alerts for e in (a.event_ids or [])]
    events = {e.event_id: e for e in
              s.query(Event).filter(Event.event_id.in_(event_ids))}
    actions = (s.query(Action)
                .filter(Action.incident_id == incident.incident_id)
                .order_by(Action.requested_at).all())

    steps: list[AgentStep] = []

    # ── Detection ───────────────────────────────────────────────────────
    seen_rules: set[str] = set()
    for a in alerts:
        if a.rule_id in seen_rules:
            continue
        seen_rules.add(a.rule_id)

        if a.rule_id == "INJECTION_ATTEMPT":
            steps.append(AgentStep(
                "detection", "Detection Agent",
                a.detected_at.isoformat(),
                "Blocked adversarial content aimed at the AI",
                "Instruction-like text found in an attacker-controlled field. "
                "Redacted, and raised as an alert in its own right.",
                "Pattern match on the untrusted field boundary",
                a.event_ids or []))
            continue

        ev = events.get((a.event_ids or [None])[0])

        if a.origin == "ai_triage":
            steps.append(AgentStep(
                "detection", "Detection Agent",
                a.detected_at.isoformat(),
                f"{a.rule_title} (no rule matched this)",
                f"{a.ai_reason or ''} Flagged first by the anomaly baseline: "
                f"{'; '.join(a.anomalies or []) or 'unusual for this environment'}. "
                f"Confidence {a.ai_confidence or 0:.2f}. Capped at "
                f"{a.severity} severity because only a written rule may "
                f"call something critical.",
                "Anomaly baseline, then model review — proposal only",
                a.event_ids or [],
                ai_assisted=True))
            continue

        steps.append(AgentStep(
            "detection", "Detection Agent",
            a.detected_at.isoformat(),
            a.rule_title,
            _detection_detail(a, ev),
            f"Sigma rule {a.rule_id}",
            a.event_ids or []))

    # ── Analysis ────────────────────────────────────────────────────────
    if alerts:
        steps.append(AgentStep(
            "analysis", "Analysis Agent",
            alerts[0].detected_at.isoformat(),
            "Connected related events into one incident",
            f"{len(alerts)} alerts across {len(incident.entity_ids)} entities "
            f"were linked through the entity graph. Shared infrastructure was "
            f"excluded so unrelated activity did not merge.",
            "Weighted graph distance with hub suppression",
            [a.alert_id for a in alerts]))

        breadth = sum(incident.stages or [])
        steps.append(AgentStep(
            "analysis", "Analysis Agent",
            incident.last_seen.isoformat(),
            f"Mapped the chain to {breadth} of 7 attack stages",
            f"Stages observed: {', '.join(incident.tactics)}. Scoring is by "
            f"how far through the lifecycle the incident has travelled, not "
            f"by how many alerts fired.",
            "MITRE ATT&CK lookup + kill-chain breadth"))

        f = incident.risk_factors or {}
        steps.append(AgentStep(
            "analysis", "Analysis Agent",
            incident.last_seen.isoformat(),
            f"Scored the incident at {incident.base_score:.0f}",
            " × ".join(f"{k.replace('_', ' ')} {v}" for k, v in f.items()),
            "Deterministic arithmetic — no model involved"))

        # The model's argument about the number, and what it was allowed.
        if incident.ai_score_status not in ("not_run", "below_threshold"):
            d = incident.ai_score_delta or 0.0
            steps.append(AgentStep(
                "analysis", "Analysis Agent",
                incident.last_seen.isoformat(),
                (f"Argued the score {'up' if d > 0 else 'down'} by "
                 f"{abs(d):.0f}, to {incident.risk_score:.0f}"
                 if d else "Agreed with the deterministic score"),
                (f"{incident.ai_score_reason or 'No adjustment argued for.'} "
                 f"Movement is limited to +{config.AI_SCORE_MAX_UP:.0f} / "
                 f"−{config.AI_SCORE_MAX_DOWN:.0f} by policy, and the base "
                 f"score of {incident.base_score:.0f} stays on the record."),
                "Model proposal, clamped in policy",
                ai_assisted=True))

        # Links the graph could not walk, and whether a human took them.
        for link in s.query(CampaignLink).filter(
                (CampaignLink.incident_a == incident.incident_id) |
                (CampaignLink.incident_b == incident.incident_id)).all():
            other = (link.incident_b if link.incident_a == incident.incident_id
                     else link.incident_a)
            verdict = {
                "proposed": "Waiting for an analyst to accept or decline.",
                "accepted": f"Accepted by {link.decided_by}; the incidents "
                            f"were merged.",
                "declined": f"Declined by {link.decided_by}.",
                "rejected": "Rejected by the gate before an analyst saw it: "
                            + ", ".join(link.gate.get("failed", [])),
            }.get(link.status, link.status)
            steps.append(AgentStep(
                "analysis", "Analysis Agent",
                (link.decided_at or incident.last_seen).isoformat(),
                f"Proposed that {other} is the same campaign",
                f"{link.reason or ''} Confidence {link.confidence:.2f}. "
                f"{verdict}",
                "Model proposal, checked against timing and progression",
                ai_assisted=True))

        if incident.narrative and incident.narrative.get("status") == "ok":
            steps.append(AgentStep(
                "analysis", "Analysis Agent",
                incident.last_seen.isoformat(),
                "Wrote the incident briefing",
                f"Every claim cited to a log entry. "
                f"{incident.narrative.get('stripped_claims', 0)} unverifiable "
                f"statements were removed before display.",
                f"{incident.narrative.get('provider', 'local')} "
                f"({incident.narrative.get('model', '')})",
                incident.narrative.get("citations", [])[:5],
                ai_assisted=True))

        if incident.consistency_flag:
            steps.append(AgentStep(
                "analysis", "Analysis Agent",
                incident.last_seen.isoformat(),
                "⚠ Flagged a disagreement between the briefing and the verdict",
                "The written summary does not match what the rules concluded. "
                "The verdict stands; the wording is what is in doubt.",
                "Verdict–narrative consistency check"))

    # ── Remediation ─────────────────────────────────────────────────────
    for act in actions:
        gated = act.tier >= 2
        steps.append(AgentStep(
            "remediation", "Remediation Agent",
            (act.requested_at or incident.last_seen).isoformat(),
            f"{'Requested approval for' if gated else 'Executed'} "
            f"{act.kind.replace('_', ' ')}",
            (act.blast_radius or {}).get("summary", "") +
            (" — held for a human because it cannot be undone silently."
             if gated else " — reversible, so it ran automatically."),
            f"Playbook step, tier {act.tier}"))

    steps.sort(key=lambda s: s.at)

    ai_steps = sum(1 for st in steps if st.ai_assisted)
    return {
        "agents": AGENTS,
        "steps": [asdict(st) for st in steps],
        "note": ("These are the named stages of one pipeline, not autonomous "
                 "language-model agents. The engine column shows what "
                 "produced each conclusion, and where a model proposed "
                 "something it also shows what bounded the proposal."),
        "ai_assisted_steps": ai_steps,
        "deterministic_steps": len(steps) - ai_steps,
        "total_steps": len(steps),
    }


def _detection_detail(alert: Alert, ev: Event | None) -> str:
    if not ev:
        return f"Technique {alert.technique or 'unknown'}"
    bits = []
    if ev.actor_user:
        bits.append(f"account {ev.actor_user}")
    if ev.src_host:
        bits.append(f"on {ev.src_host}")
    if ev.dst_host:
        bits.append(f"reaching {ev.dst_host}")
    if ev.process and ev.parent_process:
        bits.append(f"{ev.parent_process} started {ev.process}")
    if ev.dst_ip:
        bits.append(f"contacted {ev.dst_ip}")
    return ", ".join(bits) or f"Technique {alert.technique or 'unknown'}"


# ══════════════════════════════════════════════════════════════════════
#  TRUST TIME MACHINE
# ══════════════════════════════════════════════════════════════════════

def trust_time_machine(s: Session, incident: Incident) -> dict:
    """What happened the last time something like this appeared.

    Computed from the feedback log, not written by a model — which is the
    point. It answers the question every analyst actually asks, with the
    record rather than an assertion.
    """
    from app.models import Feedback

    history = (s.query(Incident)
                .filter(Incident.incident_id != incident.incident_id,
                        Incident.status.in_(["closed", "contained",
                                             "false_positive"])).all())

    scored = [(h, _similarity(incident, h)) for h in history]
    similar = [h for h, sim in scored if sim >= 0.55]

    if not similar:
        return {"count": 0,
                "message": "No comparable incidents in the record yet."}

    outcomes: dict[str, int] = {}
    actions_taken: dict[str, int] = {}
    for h in similar:
        fb = s.query(Feedback).filter(
            Feedback.incident_id == h.incident_id).first()
        label = {"tp": "Confirmed threat",
                 "fp": "False positive"}.get(fb.verdict if fb else "",
                                             "Not reviewed")
        outcomes[label] = outcomes.get(label, 0) + 1

        act = (s.query(Action)
                .filter(Action.incident_id == h.incident_id,
                        Action.status == "executed",
                        Action.tier >= 2).first())
        key = act.kind.replace("_", " ").title() if act else "Monitored"
        actions_taken[key] = actions_taken.get(key, 0) + 1

    confirmed = outcomes.get("Confirmed threat", 0)
    total = sum(outcomes.values())

    return {
        "count": len(similar),
        "actions_taken": actions_taken,
        "outcomes": outcomes,
        "confirmed_rate": round(confirmed / total, 2) if total else None,
        "summary": (
            f"Of the last {len(similar)} similar incidents, "
            f"{max(actions_taken.items(), key=lambda x: x[1])[0].lower()} "
            f"was the most common response. "
            f"{confirmed} were confirmed threats and "
            f"{outcomes.get('False positive', 0)} were false positives."),
        "source": "computed from the feedback log",
    }


def _similarity(a: Incident, b: Incident) -> float:
    ta, tb = set(a.tactics or []), set(b.tactics or [])
    if not (ta | tb):
        return 0.0
    jaccard = len(ta & tb) / len(ta | tb)
    breadth = 1 - abs(sum(a.stages or []) - sum(b.stages or [])) / 7
    return round(0.7 * jaccard + 0.3 * breadth, 3)
