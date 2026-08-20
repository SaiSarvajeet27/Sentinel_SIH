"""The seven-step guided demo.

The frontend shows "S27 DEMO: Step 1/7" with play, next and reset controls.
This drives it.

Each step is a scripted beat that injects events, runs the real pipeline over
them, and publishes WebSocket messages so the interface reacts live. Nothing
here is faked — the steps only control *when* events arrive. Detection,
correlation, scoring and the approval gate all run for real.

The narrative arc covers the three threats named in the problem statement
title, and gives the injection defence a step of its own because that is the
part nobody else has.
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from ulid import ULID

from app import config
from app.db import bus, counters, get_session
from app.services import assist, pipeline, scenario

log = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════════
#  THE SCRIPT
# ══════════════════════════════════════════════════════════════════════

@dataclass
class Step:
    n: int
    key: str
    title: str
    caption: str
    duration_s: float          # how long "play" waits before advancing
    techniques: list[str] = field(default_factory=list)
    expect: str = ""           # what the judge should be looking at


STEPS: list[Step] = [
    Step(
        1, "baseline", "Baseline Operational State",
        "Twenty-five staff, twelve machines, an ordinary working day. "
        "Around 30,000 events an hour and nothing worth waking anyone for.",
        6.0,
        expect="Counters climbing. No incidents. This is the noise the "
               "attack has to hide inside.",
    ),
    Step(
        2, "phishing", "Phishing Email Delivered",
        "A message reaches the Accounts Officer with an attachment. "
        "The mail gateway logs it. Nothing has gone wrong yet.",
        7.0,
        techniques=["T1566.001", "T1204.002"],
        expect="One low-severity alert. On its own it means nothing — "
               "people open attachments all day.",
    ),
    Step(
        3, "execution", "Endpoint Compromise",
        "The document spawns PowerShell with an encoded command, which then "
        "contacts an unfamiliar address.",
        8.0,
        techniques=["T1059.001", "T1053.005", "T1071.001"],
        expect="Alerts start connecting. The entity graph draws its first "
               "edges and an incident forms.",
    ),
    Step(
        4, "identity", "Identity Abuse Detected",
        "Credentials are read from process memory. The account then "
        "authenticates to a file server it has never touched.",
        8.0,
        techniques=["T1003.001", "T1078", "T1087.002"],
        expect="Risk climbs sharply — not because there are more alerts, "
               "but because the incident now spans more attack stages.",
    ),
    Step(
        5, "injection", "Adversarial Content Blocked",
        "The attacker names a file with instructions aimed at our AI. "
        "We strip it, and we raise it as an alert in its own right.",
        9.0,
        techniques=["T1565"],
        expect="A legitimate filename does not address an AI system. "
               "The attempt is evidence, not noise — and the verdict is "
               "unchanged, because the model never had authority over it.",
    ),
    Step(
        6, "ransomware", "Ransomware Staging & AI Analysis",
        "Shadow copies are deleted — recovery is being destroyed. The AI "
        "writes the incident up, cites every claim, and argues both sides.",
        10.0,
        techniques=["T1562.001", "T1083", "T1490"],
        expect="Seven of seven stages — the defences are turned off first, "
               "which is why the rest is quiet. The narrative appears with "
               "citations and the consistency check confirms it matches.",
    ),
    Step(
        7, "approval", "Human Approval & Containment",
        "Reversible actions have already run. Isolating the host and "
        "suspending the account stop and wait for a person.",
        0.0,
        techniques=["T1486"],
        expect="Two tier-2 actions held. Blast radius shown. Nothing "
               "irreversible happens without a named human.",
    ),
]


# ══════════════════════════════════════════════════════════════════════
#  STATE
# ══════════════════════════════════════════════════════════════════════

@dataclass
class DemoState:
    run_id: str = ""
    step: int = 0                    # 0 = not started
    playing: bool = False
    plan: dict = field(default_factory=dict)
    sim_clock: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    incident_id: str | None = None
    started_at: datetime | None = None
    triage_calls: int = 0        # capped, so a long run cannot drift
    analysis_calls: int = 0      # path B — the blind reading of each window
    ai_findings: int = 0         # alerts the model raised that no rule did
    link_proposals: int = 0
    disagreements: int = 0       # incidents where the two paths differed

    def public(self) -> dict:
        cur = STEPS[self.step - 1] if 0 < self.step <= len(STEPS) else None
        return {
            "run_id": self.run_id,
            "step": self.step,
            "total": len(STEPS),
            "playing": self.playing,
            "title": cur.title if cur else "Not started",
            "caption": cur.caption if cur else "",
            "expect": cur.expect if cur else "",
            "key": cur.key if cur else "idle",
            "incident_id": self.incident_id,
            "ai_assist": {
                "triage_calls": self.triage_calls,
                "triage_budget": config.TRIAGE_CALLS_PER_RUN,
                "analysis_calls": self.analysis_calls,
                "analysis_budget": config.ANALYSIS_CALLS_PER_RUN,
                "findings_raised": self.ai_findings,
                "links_proposed": self.link_proposals,
                "disagreements": self.disagreements,
                "dual_path": config.DUAL_PATH_ENABLED,
            },
            "scenario": {
                "name": self.plan.get("name"),
                "victim": self.plan.get("victim"),
                "lure": self.plan.get("lure"),
                "generated_by": self.plan.get("_generated_by"),
            } if self.plan else None,
        }


state = DemoState()
_play_task: asyncio.Task | None = None


# ══════════════════════════════════════════════════════════════════════
#  CONTROL
# ══════════════════════════════════════════════════════════════════════

async def start(regenerate: bool = True) -> dict:
    """Reset, ask Gemini for a fresh scenario, arm step 1."""
    await stop()

    state.run_id = str(ULID()).lower()
    state.step = 0
    state.playing = False
    state.incident_id = None
    state.triage_calls = 0
    state.analysis_calls = 0
    state.ai_findings = 0
    state.link_proposals = 0
    state.disagreements = 0
    pipeline.baseline.clear()
    pipeline.alert_rate.clear()
    pipeline.take_candidates(0)
    state.sim_clock = datetime.now(timezone.utc).replace(hour=10, minute=4,
                                                         second=0, microsecond=0)
    state.started_at = datetime.now(timezone.utc)
    counters.reset()

    # Gemini writes the plan. Falls back to a fixed scenario if unavailable,
    # so the demo never depends on an API being reachable.
    state.plan = scenario.generate() if regenerate else scenario._fallback(
        scenario.DEFAULT_CHAIN)

    with get_session() as s:
        from app.models import Run
        s.add(Run(run_id=state.run_id, scenario=state.plan, status="running"))

    bus.publish("demo.started", state.public())
    log.info("demo run %s started (scenario by %s)",
             state.run_id, state.plan.get("_generated_by"))
    return state.public()


async def next_step() -> dict:
    if state.step >= len(STEPS):
        return state.public()
    if not state.run_id:
        await start()

    state.step += 1
    step = STEPS[state.step - 1]

    bus.publish("demo.step", {**state.public(), "phase": "begin"})
    await _run_step(step)
    bus.publish("demo.step", {**state.public(), "phase": "complete"})
    return state.public()


async def play() -> dict:
    """Advance automatically, pausing on each step so a judge can read it."""
    global _play_task
    if state.playing:
        return state.public()
    if not state.run_id:
        await start()

    state.playing = True
    bus.publish("demo.playing", {"playing": True})

    async def loop():
        try:
            while state.step < len(STEPS) and state.playing:
                await next_step()
                step = STEPS[state.step - 1]
                if step.duration_s:
                    await asyncio.sleep(step.duration_s)
        finally:
            state.playing = False
            bus.publish("demo.playing", {"playing": False})

    _play_task = asyncio.create_task(loop())
    return state.public()


async def pause() -> dict:
    state.playing = False
    bus.publish("demo.playing", {"playing": False})
    return state.public()


async def stop() -> None:
    global _play_task
    state.playing = False
    if _play_task and not _play_task.done():
        _play_task.cancel()
        try:
            await _play_task
        except (asyncio.CancelledError, Exception):    # noqa: BLE001
            pass
    _play_task = None


async def reset() -> dict:
    """Clear the working tables. The ledger is append-only and survives."""
    await stop()
    with get_session() as s:
        from app.models import (Action, Alert, CampaignLink, Event, Incident,
                                MetricPoint)
        for model in (Action, Alert, CampaignLink, Incident, Event,
                      MetricPoint):
            s.query(model).delete()
    counters.reset()
    pipeline.graph.clear()
    pipeline.baseline.clear()
    pipeline.alert_rate.clear()
    pipeline.take_candidates(0)
    state.run_id = ""
    state.step = 0
    state.plan = {}
    state.incident_id = None
    state.triage_calls = 0
    state.analysis_calls = 0
    state.ai_findings = 0
    state.link_proposals = 0
    state.disagreements = 0

    from app.services import governance
    governance.append("system", "demo_reset",
                      {"at": datetime.now(timezone.utc).isoformat()})

    bus.publish("demo.reset", {})
    bus.publish("counters", counters.snapshot())
    return state.public()


# ══════════════════════════════════════════════════════════════════════
#  EXECUTION
# ══════════════════════════════════════════════════════════════════════

async def _run_step(step: Step) -> None:
    handler = {
        "baseline":   _step_baseline,
        "phishing":   _step_attack,
        "execution":  _step_attack,
        "identity":   _step_attack,
        "injection":  _step_injection,
        "ransomware": _step_ransomware,
        "approval":   _step_approval,
    }[step.key]
    try:
        await handler(step)
    except Exception:                                   # noqa: BLE001
        log.exception("demo step %s failed", step.key)
        bus.publish("demo.error", {"step": step.n, "key": step.key})


async def _step_baseline(step: Step) -> None:
    """Ordinary activity. Establishes what noise looks like."""
    from app.services import noise
    batch = noise.generate_window(
        start=state.sim_clock, minutes=45,
        hosts=config.SIM_HOSTS, users=config.SIM_USERS, run_id=state.run_id,
    )
    await _ingest(batch, chunk=180, delay=0.12)
    state.sim_clock += timedelta(minutes=45)


async def _step_attack(step: Step) -> None:
    """One phase of the chain, buried in continuing background noise."""
    from app.services import noise

    attack = scenario.expand_phase_labelled(
        state.plan, step.techniques, state.sim_clock, state.run_id)
    background = noise.generate_window(
        start=state.sim_clock, minutes=6,
        hosts=config.SIM_HOSTS, users=config.SIM_USERS, run_id=state.run_id, density=0.35)

    merged = sorted(attack + background, key=lambda e: e["ts"])
    await _ingest(merged, chunk=40, delay=0.16)
    state.sim_clock += timedelta(minutes=6)

    # Path A has finished. Path B now reads the same window, blind to what
    # the rules concluded, and reaches its own view.
    await _run_second_analyst(merged)

    # And the narrower pass over statistically odd events no rule matched.
    await _run_triage()

    # The identity phase is where the attacker moves to a second person on
    # a machine sharing nothing with the first. The graph correctly makes
    # that a separate incident — and then the model proposes they are one
    # campaign, the gate checks it, and an analyst decides.
    if step.key == "identity":
        second = scenario.expand_second_victim(
            state.plan, state.sim_clock, state.run_id)
        await _ingest(second, chunk=10, delay=0.25)
        state.sim_clock += timedelta(minutes=2)
        bus.publish("demo.second_victim", {
            "victim": state.plan.get("second_victim"),
            "message": ("A second account is being used from a machine that "
                        "shares nothing with the first. The entity graph has "
                        "no path to walk, so this is a separate incident."),
        })
        await _run_link_review()


# ══════════════════════════════════════════════════════════════════════
#  THE AI ASSISTS  —  after the deterministic pass, never instead of it
# ══════════════════════════════════════════════════════════════════════

async def _run_second_analyst(events: list[dict]) -> None:
    """Path B. Reads the same window the rules read, and is not told what
    they found."""
    if not config.DUAL_PATH_ENABLED or not events:
        return
    if state.analysis_calls >= config.ANALYSIS_CALLS_PER_RUN:
        return

    state.analysis_calls += 1
    bus.publish("ai.thinking", {"task": "analysis", "events": len(events)})

    result = await asyncio.to_thread(assist.analyse_window, events,
                                     state.run_id)

    admitted = {}
    if result.get("accepted"):
        admitted = await asyncio.to_thread(
            pipeline.admit_ai_alerts, result["accepted"])
        if admitted.get("alerts"):
            counters.bump("alerts", len(admitted["alerts"]))
            for a in admitted["alerts"]:
                bus.publish("alert", a)

    state.ai_findings += len(result.get("accepted", []))
    bus.publish("ai.analysis", {
        "reviewed": result.get("reviewed", 0),
        "assessment": result.get("assessment", ""),
        "quiet": result.get("quiet", True),
        "raised": len(result.get("accepted", [])),
        "discarded": len(result.get("rejected", [])),
        "status": result.get("status"),
        "findings": [{"title": f["title"], "technique": f["technique"],
                      "confidence": f["confidence"], "reason": f["reason"],
                      "supporting_events": f["supporting_events"]}
                     for f in result.get("accepted", [])],
        "message": ("The second analyst read the same window and was not "
                    "shown what the rules found."),
    })
    bus.publish("counters", counters.snapshot())


async def _run_triage() -> None:
    """Review the odd-but-unmatched events. Bounded per run."""
    if state.triage_calls >= config.TRIAGE_CALLS_PER_RUN:
        return
    if pipeline.candidate_count() < 4:
        return

    candidates = pipeline.take_candidates(config.TRIAGE_CANDIDATES_MAX)
    state.triage_calls += 1

    bus.publish("ai.thinking", {"task": "triage",
                                "candidates": len(candidates)})
    result = await asyncio.to_thread(assist.triage, candidates, state.run_id)

    admitted = {}
    if result.get("accepted"):
        admitted = await asyncio.to_thread(
            pipeline.admit_ai_alerts, result["accepted"])
        if admitted.get("alerts"):
            counters.bump("alerts", len(admitted["alerts"]))
            for a in admitted["alerts"]:
                bus.publish("alert", a)
        for inc in admitted.get("incidents", []):
            state.incident_id = state.incident_id or inc["incident_id"]
            bus.publish("incident.updated",
                        {"incident_id": inc["incident_id"],
                         "risk": inc["risk_score"]})

    state.ai_findings += len(result.get("accepted", []))
    bus.publish("ai.triage", {
        "reviewed": result.get("reviewed", 0),
        "raised": len(result.get("accepted", [])),
        "discarded": len(result.get("rejected", [])),
        "status": result.get("status"),
        "severity_cap": config.TRIAGE_MAX_SEVERITY,
        "findings": [{"title": f["title"], "technique": f["technique"],
                      "confidence": f["confidence"], "reason": f["reason"],
                      "anomalies": f["event"]["anomalies"]}
                     for f in result.get("accepted", [])],
        "message": (f"{result.get('reviewed', 0)} unusual events that no rule "
                    f"matched were reviewed; "
                    f"{len(result.get('accepted', []))} raised as alerts."),
    })
    bus.publish("counters", counters.snapshot())


async def _run_link_review() -> None:
    """Ask whether any of the open incidents are one campaign."""
    bus.publish("ai.thinking", {"task": "correlate"})
    result = await asyncio.to_thread(_link_review_sync)

    state.link_proposals = len(result.get("proposed", []))
    bus.publish("ai.links", {
        "proposed": result.get("proposed", []),
        "rejected_by_gate": len(result.get("rejected", [])),
        "status": result.get("status"),
        "message": ("Proposed links are shown to an analyst. Accepting one "
                    "merges the incidents; nothing merges on its own."),
    })


def _link_review_sync() -> dict:
    with get_session() as s:
        return assist.propose_links(s, state.run_id)


async def _step_injection(step: Step) -> None:
    """The attacker writes an instruction into a filename.

    The whole point of this step: the verdict does not move. The model never
    had the authority for it to move.
    """
    from app.services import noise

    risk_before = _current_risk()

    poisoned = scenario.expand_injection(
        state.plan, state.sim_clock, state.run_id,
        attack_class="persona_hijack", surface="filename")
    background = noise.generate_window(
        start=state.sim_clock, minutes=4, hosts=config.SIM_HOSTS, users=config.SIM_USERS,
        run_id=state.run_id, density=0.3)

    await _ingest(sorted(poisoned + background, key=lambda e: e["ts"]),
                  chunk=30, delay=0.18)
    state.sim_clock += timedelta(minutes=4)

    risk_after = _current_risk()
    bus.publish("demo.injection_result", {
        "risk_before": risk_before,
        "risk_after": risk_after,
        "verdict_changed": abs(risk_after - risk_before) > 8,
        "message": "Injection attempt detected, redacted, and raised as an "
                   "alert. The verdict is unchanged.",
    })


async def _step_ransomware(step: Step) -> None:
    """Shadow copies deleted, then the AI writes the incident up."""
    from app.services import noise

    attack = scenario.expand_phase_labelled(
        state.plan, step.techniques, state.sim_clock, state.run_id)
    background = noise.generate_window(
        start=state.sim_clock, minutes=5, hosts=config.SIM_HOSTS, users=config.SIM_USERS,
        run_id=state.run_id, density=0.25)

    await _ingest(sorted(attack + background, key=lambda e: e["ts"]),
                  chunk=30, delay=0.15)
    state.sim_clock += timedelta(minutes=5)

    await _run_triage()

    # Now the AI runs — on an incident that is already fully scored.
    if state.incident_id:
        bus.publish("ai.thinking", {"incident_id": state.incident_id,
                                    "task": "narrative"})
        await asyncio.to_thread(_enrich_with_ai, state.incident_id)

        # And argues about the number. It gets ±15/−10 of movement, and
        # the base score stays on the record beside whatever it produced.
        bus.publish("ai.thinking", {"incident_id": state.incident_id,
                                    "task": "score"})
        adj = await asyncio.to_thread(_score_assist, state.incident_id)
        bus.publish("ai.score", {
            "incident_id": state.incident_id,
            "base_score": adj.get("base_score"),
            "requested": adj.get("requested"),
            "delta": adj.get("delta"),
            "was_clamped": adj.get("was_clamped"),
            "floor_held": adj.get("floor_held"),
            "final_score": adj.get("final_score"),
            "factor": adj.get("factor"),
            "reason": adj.get("reason"),
            "status": adj.get("status"),
        })

        # Then the second verdict — reached without being shown ours — and
        # the reconciliation between them. This is the moment to point at
        # on stage: two independent methods, and whether they agree.
        bus.publish("ai.thinking", {"incident_id": state.incident_id,
                                    "task": "assess"})
        detail = await asyncio.to_thread(_second_verdict, state.incident_id)
        if detail.get("agreement") == "disagreement":
            state.disagreements += 1
        bus.publish("ai.verdicts", {"incident_id": state.incident_id,
                                    **detail})
        bus.publish("incident.updated", {"incident_id": state.incident_id})


def _second_verdict(incident_id: str) -> dict:
    """Path B's own assessment, then reconcile the two."""
    from app.models import Incident
    with get_session() as s:
        inc = s.get(Incident, incident_id)
        if not inc:
            return {}
        assist.independent_assessment(s, inc)
        return dict(inc.agreement_detail or {})


def _score_assist(incident_id: str) -> dict:
    from app.models import Incident
    with get_session() as s:
        inc = s.get(Incident, incident_id)
        return assist.score_assist(s, inc) if inc else {}


async def _step_approval(step: Step) -> None:
    """Final technique, then playbook matching and the approval gate."""
    attack = scenario.expand_phase_labelled(
        state.plan, step.techniques, state.sim_clock, state.run_id)
    await _ingest(attack, chunk=20, delay=0.2)

    if not state.incident_id:
        return

    # The AI writes the remediation plan. Policy assigns the tier, the graph
    # computes the blast radius, and anything irreversible waits for a person.
    bus.publish("ai.thinking", {"incident_id": state.incident_id,
                                "task": "remediation"})
    result = await asyncio.to_thread(_propose_fix, state.incident_id)

    counters.actions_pending = result.get("awaiting_approval", 0)
    bus.publish("remediation.proposed", {
        "incident_id": state.incident_id,
        "source": result.get("proposal", {}).get("source"),
        "summary": result.get("proposal", {}).get("summary"),
        "steps": len(result.get("actions", [])),
        "awaiting_approval": result.get("awaiting_approval", 0),
    })
    bus.publish("approval.required", {"incident_id": state.incident_id})
    bus.publish("counters", counters.snapshot())


def _propose_fix(incident_id: str) -> dict:
    from app.models import Incident
    from app.services import governance, remediate

    with get_session() as s:
        inc = s.get(Incident, incident_id)
        if not inc:
            return {}
        facts = governance.facts_for_incident(s, inc)
        facts["blind_spots"] = governance.blind_spots(s, inc)
        return remediate.build_and_gate(s, inc, facts)


# ── shared ──────────────────────────────────────────────────────────────

async def _ingest(events: list[dict], chunk: int, delay: float) -> None:
    """Feed events through the real pipeline in visible batches."""
    from app.services import pipeline

    for i in range(0, len(events), chunk):
        batch = events[i:i + chunk]

        result = await asyncio.to_thread(pipeline.process_batch, batch)

        counters.bump("events", len(batch))
        if result.alerts:
            counters.bump("alerts", len(result.alerts))
        if result.injections:
            counters.bump("injections", result.injections)
        if result.flood:
            bus.publish("alert.flood", result.flood)
        if result.incident_id:
            state.incident_id = result.incident_id

        bus.publish("counters", counters.snapshot())
        for a in result.alerts:
            bus.publish("alert", a)
        if result.incident_id:
            bus.publish("incident.updated",
                        {"incident_id": result.incident_id,
                         "risk": result.risk})
        if result.graph_delta:
            bus.publish("graph.delta", result.graph_delta)

        await asyncio.sleep(delay)


def _enrich_with_ai(incident_id: str) -> None:
    """One batched call fills every explanation tab. Runs off the event
    loop because it is the slowest thing in the pipeline."""
    from app import config
    from app.models import Alert, Event, Incident
    from app.services import explain, governance

    with get_session() as s:
        inc = s.get(Incident, incident_id)
        if not inc:
            return
        events = (s.query(Event)
                   .filter(Event.event_id.in_(_event_ids_of(s, inc)))
                   .order_by(Event.ts).all())
        if not events:
            return

        facts = governance.facts_for_incident(s, inc)
        facts["blind_spots"] = governance.blind_spots(s, inc)

        exp = explain.build_explanation(inc, events, facts)

        inc.narrative = {
            "summary": exp.get("summary", ""),
            "citations": exp.get("citations", []),
            "stripped_claims": exp.get("stripped_claims", 0),
            "provider": exp.get("provider", ""),
            "model": exp.get("model", ""),
            "cached": exp.get("cached", False),
            "status": exp.get("status", "ok"),
        }
        inc.narrative_status = exp.get("status", "ok")
        inc.reasoning_steps  = exp.get("reasoning_steps", [])
        inc.evidence         = exp.get("evidence", [])
        inc.limitations      = exp.get("limitations", []) or facts["blind_spots"]
        inc.what_would_change = exp.get("what_would_change_this", [])
        inc.rationale        = exp.get("rationale", "")
        inc.both_sides       = {"why_act": exp.get("why_act", ""),
                                "why_wait": exp.get("why_wait", "")}
        inc.blind_spots      = facts["blind_spots"]
        inc.consistency_flag = not exp.get("consistent", True)

        techs = {a.technique for a in
                 s.query(Alert).filter(Alert.incident_id == incident_id)}
        for t in techs:
            if t in config.TECHNIQUE_CATEGORY:
                inc.category = config.TECHNIQUE_CATEGORY[t]
                break

        for finding in exp.get("findings", []):
            inc.injection_detected = True
            inc.injection_details = (inc.injection_details or []) + [
                {"field": finding.field, "class": finding.attack_class}]


def _event_ids_of(s, inc) -> list[str]:
    from app.models import Alert
    ids: list[str] = []
    for a in s.query(Alert).filter(Alert.incident_id == inc.incident_id):
        ids.extend(a.event_ids or [])
    return ids


def _primary_action(s, inc):
    from app.models import Action
    return (s.query(Action)
             .filter(Action.incident_id == inc.incident_id, Action.tier >= 2)
             .first())


def _current_risk() -> float:
    if not state.incident_id:
        return 0.0
    from app.models import Incident
    with get_session() as s:
        inc = s.get(Incident, state.incident_id)
        return float(inc.risk_score) if inc else 0.0
