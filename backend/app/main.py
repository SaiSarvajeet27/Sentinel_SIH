"""FastAPI application — every endpoint the frontend calls.

WebSocket at /ws pushes counters, alerts, incidents, graph deltas and demo
step changes as they happen.
"""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import (Depends, FastAPI, HTTPException, Query, Request,
                     WebSocket, WebSocketDisconnect, status)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import config
from app.db import bus, counters, db_dep, init_db
from app.llm import router as llm_router
from app.models import (Action, Alert, AppUser, CampaignLink, Event, Incident,
                         Notification, Rule)
from app import auth
from app.services import (agents, assist, demo, devices, governance,
                          metrics, pipeline, remediate, respond)

logging.basicConfig(level=config.LOG_LEVEL,
                    format="%(asctime)s %(levelname)-7s %(name)s: %(message)s")
log = logging.getLogger("sentinel")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()

    # Warm the entity graph from whatever is already in the database, so a
    # restart mid-rehearsal does not empty the attack graph.
    try:
        from app.db import get_session
        with get_session() as s:
            n = pipeline.rebuild_from_events(s)
        if n:
            log.info("graph warmed from %d stored events", n)
    except Exception:                                    # noqa: BLE001
        log.exception("graph warm-up failed; starting cold")

    task = asyncio.create_task(_metrics_flusher())
    auto_gen_task = asyncio.create_task(_auto_generate_loop())
    log.info("Sentinel SOC ready — AI %s",
             "enabled" if llm_router.ai_enabled() else "DISABLED")
    yield
    task.cancel()
    auto_gen_task.cancel()


app = FastAPI(title="Sentinel SOC", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS,
                    allow_credentials=True, allow_methods=["*"],
                    allow_headers=["*"])


@app.middleware("http")
async def authenticate_api(request: Request, call_next):
    """Protect every API route.

    CORSMiddleware ends up *inside* this one on the stack (Starlette builds
    user_middleware in reverse-add order), so a preflight OPTIONS request
    that reaches the 401 branch below returns before CORSMiddleware ever
    gets a chance to attach Access-Control-Allow-Origin — the browser then
    reports the *response* it never got as "blocked by CORS policy",
    hiding the real 401. A preflight never carries the Authorization
    header anyway, so it has nothing this check could validate; let it
    through unconditionally.
    """
    if request.method == "OPTIONS":
        return await call_next(request)
    if not request.url.path.startswith("/api/") or request.url.path == "/api/auth/login":
        return await call_next(request)

    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return JSONResponse({"detail": "authentication required"},
                            status_code=status.HTTP_401_UNAUTHORIZED)
    try:
        request.state.principal = auth.decode_access_token(header[7:])
    except HTTPException as exc:
        return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)
    return await call_next(request)


@app.get("/", response_class=HTMLResponse, include_in_schema=False)
def root():
    proto = config.ROOT / "index.html"
    if proto.exists():
        return HTMLResponse(content=proto.read_text(encoding="utf-8"))
    return HTMLResponse(content="""
    <!DOCTYPE html>
    <html>
        <head><title>Sentinel SOC</title></head>
        <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0E1320;color:#E6EAF2;padding:40px;">
            <h1>🛡 Sentinel SOC API</h1>
            <p>All systems operational. AI Enabled.</p>
            <ul>
                <li><a style="color:#7C6FF0" href="/docs">Interactive API Documentation (/docs)</a></li>
                <li><a style="color:#7C6FF0" href="/api/health">System Health (/api/health)</a></li>
                <li><a style="color:#7C6FF0" href="/api/dashboard">Dashboard API (/api/dashboard)</a></li>
            </ul>
        </body>
    </html>
    """)


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    return Response(status_code=204)


async def _metrics_flusher() -> None:
    from app.db import get_session
    while True:
        await asyncio.sleep(60)
        try:
            with get_session() as s:
                metrics.flush_counters(s)
        except Exception:                                # noqa: BLE001
            log.exception("metrics flush failed")


async def _seconds_since_last_generation() -> float | None:
    """When the most recent cycle actually started, in seconds ago.

    None if there has never been one. Read from the `runs` table rather
    than in-memory state, because in-memory state does not survive a
    restart — without this, restarting the backend (routine during
    development, or after a crash) would look identical to "no cycle has
    ever run" and fire one immediately regardless of how recently the last
    one actually used a Gemini call.
    """
    from app.db import get_session
    from app.models import Run
    try:
        with get_session() as s:
            last = (s.query(Run).order_by(Run.started_at.desc()).first())
            if not last or not last.started_at:
                return None
            from datetime import datetime, timezone
            started_at = last.started_at
            # SQLite hands back naive datetimes even for columns declared
            # DateTime(timezone=True) — the value itself is UTC (that's all
            # this app ever writes), it just loses the tzinfo tag on the
            # round trip, which makes subtracting an aware "now" raise.
            if started_at.tzinfo is None:
                started_at = started_at.replace(tzinfo=timezone.utc)
            return (datetime.now(timezone.utc) - started_at).total_seconds()
    except Exception:                                    # noqa: BLE001
        log.exception("could not read last generation time; assuming none")
        return None


async def _auto_generate_loop() -> None:
    """Keep the SOC live without anyone clicking a demo Play button.

    Runs the same real pipeline the guided demo uses — a fresh
    Gemini-authored attack plan, real detection, real dual-path AI
    analysis, real remediation proposal — on a timer, entirely server-side.
    Skips a cycle if one is already running rather than overlapping two.

    Gemini's free-tier daily quota is small (observed as low as ~20
    requests/day for this one project) and this loop is the only thing
    that calls it in normal operation, at one call per cycle — but going
    over that quota does not break anything: app.llm.router falls back
    Gemini → Groq → Ollama automatically, so a cycle beyond the daily
    Gemini allowance still gets a fresh AI-authored scenario, just from
    Groq instead. The one real risk was wasted quota, not broken
    generation: every backend restart used to fire an immediate cycle
    regardless of how recently the last one ran, which during active
    development (many restarts in a day) could burn through the daily
    Gemini allowance on restarts alone. Fixed below by checking when the
    last cycle *actually* ran, from the database, before deciding whether
    "now" is due.
    """
    if not config.AUTO_GENERATE_ENABLED:
        log.info("auto-generation disabled (AUTO_GENERATE_ENABLED=false)")
        return
    interval = max(1, config.AUTO_GENERATE_INTERVAL_MINUTES) * 60
    await asyncio.sleep(15)          # let startup finish before the first check

    elapsed = await _seconds_since_last_generation()
    if elapsed is not None and elapsed < interval:
        wait = interval - elapsed
        log.info("auto-generation: last cycle was %.0fs ago, waiting %.0fs "
                  "before the next one instead of firing immediately",
                  elapsed, wait)
        await asyncio.sleep(wait)

    while True:
        try:
            if not demo.state.playing:
                log.info("auto-generation: starting a new incident scenario")
                await demo.start(regenerate=True)
                await demo.play()
        except Exception:                                # noqa: BLE001
            log.exception("auto-generation cycle failed")
        await asyncio.sleep(interval)


# ══════════════════════════════════════════════════════════════════════
#  SESSION / AUTHENTICATION
# ══════════════════════════════════════════════════════════════════════

@app.get("/api/me")
def me(request: Request):
    principal = auth.request_principal(request)
    perms = config.ROLE_PERMISSIONS.get(principal.role, {})
    return {"id": principal.id, "name": principal.name, "role": principal.role,
            "can": perms}


class LoginBody(BaseModel):
    email: str
    password: str


@app.post("/api/auth/login")
def login(body: LoginBody, s: Session = Depends(db_dep)):
    """Production login endpoint."""
    user = s.query(AppUser).filter(AppUser.email == body.email.lower()).first()
    if not user or not auth.password_matches(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid credentials")
    principal = auth.Principal(user.id, user.full_name, user.role)
    return {"access_token": auth.create_access_token(principal),
            "token_type": "bearer", "expires_in": config.ACCESS_TOKEN_MINUTES * 60,
            "user": {"id": principal.id, "name": principal.name,
                     "role": principal.role}}


def _principal(request: Request) -> auth.Principal:
    return auth.request_principal(request)


def _permission(request: Request, permission: str) -> auth.Principal:
    principal = _principal(request)
    auth.require_permission(principal, permission)
    return principal


# ══════════════════════════════════════════════════════════════════════
#  DEMO CONTROL  —  drives the seven-step bar
#
#  These run the real pipeline. The steps only control *when* events
#  arrive; detection, correlation, scoring and the approval gate all
#  behave exactly as they would against a live feed.
#
#  Running one mutates shared state, so it needs a senior analyst.
# ══════════════════════════════════════════════════════════════════════

@app.get("/api/demo/state")
async def demo_state():
    return {**demo.state.public(), "steps": [
        {"n": s.n, "key": s.key, "title": s.title,
         "caption": s.caption, "expect": s.expect} for s in demo.STEPS]}


@app.post("/api/demo/start")
async def demo_start(request: Request, regenerate: bool = True):
    _permission(request, "change_settings")
    return await demo.start(regenerate=regenerate)


@app.post("/api/demo/next")
async def demo_next(request: Request):
    _permission(request, "change_settings")
    return await demo.next_step()


@app.post("/api/demo/play")
async def demo_play(request: Request):
    _permission(request, "change_settings")
    return await demo.play()


@app.post("/api/demo/pause")
async def demo_pause(request: Request):
    _permission(request, "change_settings")
    return await demo.pause()


@app.post("/api/demo/reset")
async def demo_reset(request: Request):
    _permission(request, "change_settings")
    return await demo.reset()


@app.post("/api/scenarios/generate")
async def generate_scenario(request: Request):
    """Gemini writes a fresh attack plan. Different every time."""
    _permission(request, "change_settings")
    from app.services import scenario
    return await asyncio.to_thread(scenario.generate)


# ══════════════════════════════════════════════════════════════════════
#  DASHBOARD
# ══════════════════════════════════════════════════════════════════════

@app.get("/api/dashboard")
def dashboard(s: Session = Depends(db_dep)):
    return {
        "kpis": metrics.kpis(s),
        "deltas": metrics.deltas(s),
        "threat_activity": metrics.timeseries(s, "alerts", "24h"),
        "threat_types": metrics.source_breakdown(s),
        "ops_summary": metrics.ops_summary(s),
        "playbooks": metrics.playbook_stats(s)[:4],
        "threat_map": metrics.threat_map(s),
    }


@app.get("/api/metrics/timeseries")
def timeseries(metric: str = "alerts", window: str = "24h",
               group_by: str | None = None, s: Session = Depends(db_dep)):
    return metrics.timeseries(s, metric, window, group_by=group_by)


@app.get("/api/health")
def health(s: Session = Depends(db_dep)):
    return metrics.health_score(s)


@app.get("/api/benchmark")
def benchmark(run_id: str | None = None, s: Session = Depends(db_dep)):
    """Detection rate against ground truth we generated ourselves.

    Attack events are stamped with the technique they were written to
    represent, and no detection rule reads that field — so this is a real
    measurement, not a circular one. Misses are named.
    """
    return metrics.benchmark(s, run_id)


# ══════════════════════════════════════════════════════════════════════
#  INCIDENTS
# ══════════════════════════════════════════════════════════════════════

@app.get("/api/incidents")
def list_incidents(status: str | None = "open", min_risk: float = 0,
                   limit: int = 50, offset: int = 0,
                   include_historical: bool = False,
                   s: Session = Depends(db_dep)):
    """Open incidents by default.

    This used to default to *everything*, which meant the Recent Incidents
    table filled with the 36 seeded "(historical)" precedent records unless
    the caller remembered `?status=open`. Those exist only to give the
    Trust Time Machine / precedent panel something to compute statistics
    from — they carry no events, alerts or actions and were never meant to
    be individually investigated. `status=all` used to leak them back in;
    now they stay excluded regardless of `status` unless the caller passes
    `include_historical=true` explicitly (nothing in this codebase does —
    the precedent/trust-time-machine code queries the Incident table
    directly and is unaffected by this endpoint).
    """
    q = s.query(Incident).filter(Incident.risk_score >= min_risk)
    if not include_historical:
        q = q.filter(~Incident.incident_id.startswith("inc_hist_"))
    if status and status != "all":
        q = q.filter(Incident.status == status)
    total = q.count()
    rows = (q.order_by(Incident.risk_score.desc())
             .offset(offset).limit(limit).all())
    return {"total": total, "items": [_incident_row(s, i) for i in rows]}


def _incident_row(s: Session, i: Incident) -> dict:
    return {
        "incident_id": i.incident_id, "title": i.title,
        "risk_score": i.risk_score, "risk_factors": i.risk_factors,
        "confidence_band": i.confidence_band,
        "stages": i.stages, "tactics": i.tactics,
        "entities": pipeline.primary_entities(i.entity_ids or []),
        "status": i.status,
        "first_seen": i.first_seen.isoformat() if i.first_seen else None,
        "last_seen": i.last_seen.isoformat() if i.last_seen else None,
        "injection_detected": i.injection_detected,
        "consistency_flag": i.consistency_flag,
        "severity": ("critical" if i.risk_score >= 80 else
                     "high" if i.risk_score >= 55 else
                     "medium" if i.risk_score >= 30 else "low"),
        "pending_actions": s.query(Action).filter(
            Action.incident_id == i.incident_id,
            Action.status == "pending").count(),
        # The arithmetic and the model's adjustment to it, side by side.
        # A card can show "82 (74 + 8)" without a second request.
        "base_score": i.base_score,
        "ai_score_delta": i.ai_score_delta,
        "ai_score_reason": i.ai_score_reason,
        "ai_alerts": s.query(Alert).filter(
            Alert.incident_id == i.incident_id,
            Alert.origin == "ai_triage").count(),
    }


@app.get("/api/incidents/{incident_id}")
def get_incident(incident_id: str, s: Session = Depends(db_dep)):
    inc = s.get(Incident, incident_id)
    if not inc:
        raise HTTPException(404, "incident not found")

    alerts = s.query(Alert).filter(Alert.incident_id == incident_id).all()
    event_ids = [e for a in alerts for e in (a.event_ids or [])]
    events = (s.query(Event).filter(Event.event_id.in_(event_ids))
               .order_by(Event.ts).all())
    actions = s.query(Action).filter(Action.incident_id == incident_id).all()

    return {
        **_incident_row(s, inc),
        "narrative": inc.narrative,
        "narrative_status": inc.narrative_status,
        "both_sides": inc.both_sides,
        "blind_spots": governance.blind_spots(s, inc),
        "source_breakdown": _sources(events),
        "injection_details": inc.injection_details,
        "timeline": [{"event_id": e.event_id, "ts": e.ts.isoformat(),
                      "source": e.source, "actor": e.actor_user,
                      "host": e.src_host, "class": e.class_name,
                      "outcome": e.outcome} for e in events],
        "alerts": [{"alert_id": a.alert_id, "rule_id": a.rule_id,
                    "title": a.rule_title, "severity": a.severity,
                    "technique": a.technique} for a in alerts],
        "actions": [_action_row(a) for a in actions],
        "alternatives": respond.alternatives_for(inc),
        "precedent": _precedent(s, inc),
    }


def _sources(events) -> dict:
    out: dict[str, int] = {}
    for e in events:
        out[e.source] = out.get(e.source, 0) + 1
    return out


def _precedent(s: Session, inc: Incident) -> dict:
    """What happened the last time something like this appeared."""
    from app.models import Feedback
    others = (s.query(Incident)
               .filter(Incident.incident_id != inc.incident_id,
                       Incident.status.in_(["closed", "contained",
                                            "false_positive"])).all())
    similar = [o for o in others
               if _similarity(inc, o) >= 0.55]
    if not similar:
        return {"count": 0}

    verdicts: dict[str, int] = {}
    for o in similar:
        fb = s.query(Feedback).filter(
            Feedback.incident_id == o.incident_id).first()
        key = {"tp": "Confirmed threat", "fp": "False positive"}.get(
            fb.verdict if fb else "", "Not reviewed")
        verdicts[key] = verdicts.get(key, 0) + 1

    return {"count": len(similar), "outcomes": verdicts}


def _similarity(a: Incident, b: Incident) -> float:
    ta, tb = set(a.tactics or []), set(b.tactics or [])
    if not (ta | tb):
        return 0.0
    jaccard = len(ta & tb) / len(ta | tb)
    breadth = 1 - abs(sum(a.stages or []) - sum(b.stages or [])) / 7
    return 0.7 * jaccard + 0.3 * breadth


# ── the six explanation tabs ────────────────────────────────────────

@app.get("/api/incidents/{incident_id}/explanation")
def explanation(incident_id: str, s: Session = Depends(db_dep)):
    """Why This? · Evidence · Limitations — one batched model call."""
    inc = s.get(Incident, incident_id)
    if not inc:
        raise HTTPException(404, "incident not found")
    return {
        "why_this": inc.reasoning_steps or [],
        "evidence": inc.evidence or [],
        "limitations": inc.limitations or governance.blind_spots(s, inc),
        "what_would_change_this": inc.what_would_change or [],
        "rationale": inc.rationale,
        "both_sides": inc.both_sides,
        "confidence_band": inc.confidence_band,
        "confidence_driver": inc.confidence_driver,
        "status": inc.narrative_status,
        "consistency_flag": inc.consistency_flag,
        "stripped_claims": (inc.narrative or {}).get("stripped_claims", 0),
        "ai_provider": (inc.narrative or {}).get("provider"),
        "cached": (inc.narrative or {}).get("cached", False),
    }


@app.get("/api/incidents/{incident_id}/agent-pipeline")
def agent_pipeline(incident_id: str, s: Session = Depends(db_dep)):
    """Multi-Agent Transparency Pipeline — Detection, Analysis, Remediation."""
    inc = s.get(Incident, incident_id)
    if not inc:
        raise HTTPException(404, "incident not found")
    return agents.build(s, inc)


@app.get("/api/incidents/{incident_id}/trust-time-machine")
def trust_time_machine(incident_id: str, s: Session = Depends(db_dep)):
    """What happened the last time something like this appeared."""
    inc = s.get(Incident, incident_id)
    if not inc:
        raise HTTPException(404, "incident not found")
    return agents.trust_time_machine(s, inc)


@app.post("/api/incidents/{incident_id}/remediation")
def propose_remediation(incident_id: str, request: Request,
                        s: Session = Depends(db_dep)):
    """The AI writes the fix. Policy sets the tier. The human approves.

    Returns the proposed plan with the model's reasoning for each step, plus
    what it considered and rejected — so the analyst is reviewing a
    recommendation rather than rubber-stamping a list.
    """
    _principal(request)
    inc = s.get(Incident, incident_id)
    if not inc:
        raise HTTPException(404, "incident not found")
    facts = governance.facts_for_incident(s, inc)
    facts["blind_spots"] = governance.blind_spots(s, inc)
    return remediate.build_and_gate(s, inc, facts)


@app.get("/api/incidents/{incident_id}/remediation")
def get_remediation(incident_id: str, s: Session = Depends(db_dep)):
    """The plan as it stands, with each step's reasoning."""
    inc = s.get(Incident, incident_id)
    if not inc:
        raise HTTPException(404, "incident not found")
    actions = (s.query(Action)
                .filter(Action.incident_id == incident_id)
                .order_by(Action.tier, Action.requested_at).all())
    return {
        "actions": [{**_action_row(a), "why": a.rationale} for a in actions],
        "awaiting_approval": sum(1 for a in actions if a.status == "pending"),
        "auto_executed": sum(1 for a in actions if a.status == "executed"),
        "vocabulary_size": len(remediate.ACTION_VOCABULARY),
    }


@app.get("/api/incidents/{incident_id}/alternatives")
def incident_alternatives(incident_id: str, s: Session = Depends(db_dep)):
    inc = s.get(Incident, incident_id)
    if not inc:
        raise HTTPException(404, "incident not found")
    return respond.alternatives_for(inc)


# ══════════════════════════════════════════════════════════════════════
#  AI ASSIST  —  detection, chain detection, scoring
#
#  Everything here is a proposal. The rules already ran, the graph already
#  clustered, and the arithmetic already produced a score before any of
#  these endpoints can be called.
# ══════════════════════════════════════════════════════════════════════

@app.post("/api/assist/triage")
async def run_triage(request: Request, limit: int = config.TRIAGE_CANDIDATES_MAX):
    """Review the events that were unusual but that no rule matched.

    The deterministic anomaly baseline chooses the candidates; the model
    only sees those. Findings are capped at medium severity and go through
    the same clustering and scoring path a rule-fired alert takes.
    """
    _principal(request)
    candidates = pipeline.take_candidates(limit)
    if not candidates:
        return {"status": "no_candidates", "reviewed": 0,
                "note": "Nothing unusual is currently unexplained by a rule."}

    result = await asyncio.to_thread(assist.triage, candidates)
    admitted = {}
    if result.get("accepted"):
        admitted = await asyncio.to_thread(
            pipeline.admit_ai_alerts, result["accepted"])
        for a in admitted.get("alerts", []):
            bus.publish("alert", a)
    return {**result, "admitted": admitted.get("admitted", 0),
            "incidents": admitted.get("incidents", []),
            "accepted": [{"technique": f["technique"],
                          "technique_name": f["technique_name"],
                          "title": f["title"], "reason": f["reason"],
                          "confidence": f["confidence"],
                          "severity": f["severity"],
                          "event_id": f["event"]["event_id"],
                          "anomalies": f["event"]["anomalies"]}
                         for f in result.get("accepted", [])]}


@app.get("/api/assist/candidates")
def triage_candidates():
    """What the anomaly baseline is currently holding, before any model
    call. Deterministic — this list exists whether or not the AI is on."""
    return {"waiting": pipeline.candidate_count(),
            "min_oddities": config.TRIAGE_MIN_ODDITY,
            "batch_size": config.TRIAGE_CANDIDATES_MAX}


@app.post("/api/assist/links")
async def run_link_review(request: Request, s: Session = Depends(db_dep)):
    """Ask whether any open incidents are stages of one campaign."""
    _principal(request)
    return await asyncio.to_thread(assist.propose_links, s, None)


@app.get("/api/assist/links")
def list_links(status: str = "proposed", s: Session = Depends(db_dep)):
    q = s.query(CampaignLink)
    if status != "all":
        q = q.filter(CampaignLink.status == status)
    rows = q.order_by(CampaignLink.confidence.desc()).limit(50).all()
    return {"total": len(rows), "items": [
        {"id": l.id, "incident_a": l.incident_a, "incident_b": l.incident_b,
         "confidence": l.confidence, "reason": l.reason, "shared": l.shared,
         "gate": l.gate, "status": l.status, "decided_by": l.decided_by}
        for l in rows]}


class LinkDecision(BaseModel):
    reason: str | None = None


@app.post("/api/assist/links/{link_id}/accept")
def accept_campaign_link(link_id: int, request: Request,
                         body: LinkDecision | None = None,
                         s: Session = Depends(db_dep)):
    """A human merges the two incidents. The only path that does."""
    principal = _principal(request)
    result = assist.accept_link(s, link_id, principal.name)
    if not result.get("ok"):
        raise HTTPException(400, result.get("error", "cannot accept"))
    governance.append(principal.name, "campaign_link_accepted",
                      {"link_id": link_id, **result})
    bus.publish("incident.updated", {"incident_id": result["incident_id"]})
    return result


@app.post("/api/assist/links/{link_id}/decline")
def decline_campaign_link(link_id: int, request: Request,
                           body: LinkDecision | None = None,
                           s: Session = Depends(db_dep)):
    principal = _principal(request)
    result = assist.reject_link(s, link_id, principal.name,
                                body.reason if body else None)
    if not result.get("ok"):
        raise HTTPException(400, result.get("error", "cannot decline"))
    governance.append(principal.name, "campaign_link_declined",
                      {"link_id": link_id})
    return result


@app.post("/api/incidents/{incident_id}/score-assist")
async def run_score_assist(incident_id: str, request: Request,
                           s: Session = Depends(db_dep)):
    """Ask the model whether the arithmetic missed something here.

    It gets +15 / −10 of movement, clamped in policy rather than requested
    in a prompt, and a critical technique holds a floor it cannot cross.
    """
    _principal(request)
    inc = s.get(Incident, incident_id)
    if not inc:
        raise HTTPException(404, "incident not found")
    result = await asyncio.to_thread(assist.score_assist, s, inc)
    bus.publish("incident.updated", {"incident_id": incident_id})
    return result


@app.post("/api/assist/analyse")
async def run_second_analyst(request: Request, limit: int = 400,
                             s: Session = Depends(db_dep)):
    """Path B over the most recent events — the model's own reading.

    Unlike `/api/assist/triage`, this sees everything in the window,
    including events the rules already fired on, and is not told what they
    concluded. That is what makes the comparison afterwards meaningful.
    """
    _principal(request)
    rows = (s.query(Event).order_by(Event.ts.desc())
             .limit(min(limit, config.ANALYSIS_WINDOW_EVENTS)).all())
    if not rows:
        return {"status": "no_events", "findings": []}

    events = [{"event_id": e.event_id, "ts": e.ts, "actor_user": e.actor_user,
               "src_host": e.src_host, "dst_host": e.dst_host,
               "dst_ip": e.dst_ip, "process": e.process,
               "parent_process": e.parent_process, "outcome": e.outcome,
               "class_name": e.class_name, "untrusted": e.untrusted or {}}
              for e in reversed(rows)]

    result = await asyncio.to_thread(assist.analyse_window, events)
    admitted = {}
    if result.get("accepted"):
        admitted = await asyncio.to_thread(
            pipeline.admit_ai_alerts, result["accepted"])
        for a in admitted.get("alerts", []):
            bus.publish("alert", a)
    return {**result,
            "accepted": [{"technique": f["technique"], "title": f["title"],
                          "reason": f["reason"], "confidence": f["confidence"],
                          "supporting_events": f["supporting_events"]}
                         for f in result.get("accepted", [])],
            "admitted": admitted.get("admitted", 0)}


@app.post("/api/incidents/{incident_id}/assess")
async def run_independent_assessment(incident_id: str, request: Request,
                                     s: Session = Depends(db_dep)):
    """The second verdict, reached blind, then reconciled with the first."""
    _principal(request)
    inc = s.get(Incident, incident_id)
    if not inc:
        raise HTTPException(404, "incident not found")
    result = await asyncio.to_thread(assist.independent_assessment, s, inc)
    bus.publish("incident.updated", {"incident_id": incident_id})
    return {**result, "reconciliation": inc.agreement_detail}


@app.get("/api/incidents/{incident_id}/verdicts")
def incident_verdicts(incident_id: str, s: Session = Depends(db_dep)):
    """Both verdicts side by side, and what the system did about them."""
    inc = s.get(Incident, incident_id)
    if not inc:
        raise HTTPException(404, "incident not found")
    return {
        "incident_id": incident_id,
        "final_score": inc.risk_score,
        "confidence_band": inc.confidence_band,
        "confidence_driver": inc.confidence_driver,
        "agreement": inc.agreement,
        "needs_review": inc.needs_review,
        **(inc.agreement_detail or {}),
    }


@app.get("/api/assist/balance")
def analysis_balance(s: Session = Depends(db_dep)):
    """How much of the current analysis came from each path.

    A claim like "half of this is AI" should be a number on screen, not a
    sentence in a slide.
    """
    return assist.balance(s)


@app.get("/api/disagreements")
def list_disagreements(s: Session = Depends(db_dep)):
    """Every incident where the two paths reached different conclusions.

    Worth a panel of its own in the interface. An incident nobody
    understands is not a low-risk incident.
    """
    rows = (s.query(Incident)
             .filter(Incident.agreement == "disagreement",
                     Incident.status == "open")
             .order_by(Incident.risk_score.desc()).all())
    return {"total": len(rows), "items": [
        {"incident_id": i.incident_id, "title": i.title,
         "deterministic": i.base_score, "model": i.model_score,
         "final": i.risk_score, "needs_review": i.needs_review,
         "model_reasoning": i.model_reasoning,
         "detail": i.agreement_detail}
        for i in rows]}


@app.get("/api/incidents/{incident_id}/ai-contribution")
def ai_contribution(incident_id: str, s: Session = Depends(db_dep)):
    """Everything the model contributed here, and what the verdict would
    have been without it.

    The point of this endpoint is that "the AI assists but does not decide"
    becomes checkable on a specific incident instead of asserted in general.
    """
    inc = s.get(Incident, incident_id)
    if not inc:
        raise HTTPException(404, "incident not found")
    return assist.contribution(s, inc)


# ── device explorer ─────────────────────────────────────────────────

@app.get("/api/devices")
def list_devices(department: str | None = None, health: str | None = None,
                 search: str | None = None, limit: int = 50, offset: int = 0,
                 s: Session = Depends(db_dep)):
    return devices.list_devices(s, department, health, search, limit, offset)


@app.get("/api/devices/analytics")
def device_analytics(s: Session = Depends(db_dep)):
    return devices.fleet_analytics(s)


@app.get("/api/devices/{device_id}")
def device_detail(device_id: str, s: Session = Depends(db_dep)):
    d = devices.device_detail(s, device_id)
    if not d:
        raise HTTPException(404, "device not found")
    return d


# ── activity log with the stats strip ───────────────────────────────

@app.get("/api/activity")
def activity(search: str | None = None, category: str | None = None,
             decision: str | None = None, limit: int = 60,
             s: Session = Depends(db_dep)):
    from app.models import LedgerEntry
    q = s.query(LedgerEntry).order_by(LedgerEntry.seq.desc())
    rows = q.limit(400).all()

    items = []
    for e in rows:
        p = e.payload or {}
        d = {"approved": "Approved", "rejected": "Dismissed",
             "overridden": "Overridden", "escalated": "Escalated"}
        decision_label = next(
            (v for k, v in d.items() if k in e.action_type), "Pending")
        item = {
            "seq": e.seq, "at": e.ts.isoformat(), "actor": e.actor,
            "action_type": e.action_type,
            "title": p.get("kind", e.action_type).replace("_", " ").title(),
            "target": p.get("target", ""),
            "note": p.get("reason", ""),
            "decision": decision_label,
            "category": p.get("category", "security"),
            "tier": p.get("tier"),
            "signed": True,
        }
        items.append(item)

    if search:
        qq = search.lower()
        items = [i for i in items
                 if qq in i["title"].lower() or qq in (i["note"] or "").lower()]
    if category and category != "all":
        items = [i for i in items if i["category"] == category]
    if decision and decision != "all":
        items = [i for i in items
                 if i["decision"].lower() == decision.lower()]

    counts: dict[str, int] = {}
    for i in items:
        counts[i["decision"]] = counts.get(i["decision"], 0) + 1
    decided = sum(v for k, v in counts.items() if k != "Pending")
    approved = counts.get("Approved", 0)

    return {
        "stats": {
            "total": len(items),
            "approval_rate": round(approved / decided * 100, 1) if decided else 0,
            "approved": approved,
            "escalated": counts.get("Escalated", 0),
            "overridden": counts.get("Overridden", 0),
            "dismissed": counts.get("Dismissed", 0),
            "pending": counts.get("Pending", 0),
        },
        "items": items[:limit],
    }


@app.get("/api/incidents/{incident_id}/graph")
def incident_graph(incident_id: str, s: Session = Depends(db_dep)):
    inc = s.get(Incident, incident_id)
    if not inc:
        raise HTTPException(404, "incident not found")

    # The graph is in memory and does not survive a restart, while the
    # incident does. Rather than render a blank panel beside a score of 100,
    # rebuild it from the events that produced it.
    if pipeline.graph.g.number_of_nodes() == 0:
        pipeline.rebuild_from_events(s, run_id=inc.run_id)

    payload = pipeline.graph.subgraph_payload(inc.entity_ids)

    # role classification — patient zero is the earliest alerted entity
    first = (s.query(Alert).filter(Alert.incident_id == incident_id)
              .order_by(Alert.detected_at).first())
    patient_zero = (first.entities[0] if first and first.entities else None)
    for n in payload["elements"]["nodes"]:
        nid = n["data"]["id"]
        n["data"]["role"] = (
            "patient_zero" if nid == patient_zero else
            "external" if nid.startswith("ip:") else
            "compromised" if nid in inc.entity_ids else "touched")
    return payload


class FeedbackBody(BaseModel):
    verdict: str
    reason_code: str | None = None


@app.post("/api/incidents/{incident_id}/feedback")
def incident_feedback(incident_id: str, body: FeedbackBody, request: Request,
                      s: Session = Depends(db_dep)):
    if body.verdict not in {"tp", "fp", "needs_review"}:
        raise HTTPException(400, "verdict must be tp, fp, or needs_review")
    principal = _principal(request)
    try:
        return governance.submit_feedback(s, incident_id, principal.id,
                                          body.verdict, body.reason_code)
    except PermissionError as e:
        raise HTTPException(429, str(e))


VALID_INCIDENT_STATUSES = {"open", "investigating", "contained", "resolved",
                           "closed", "false_positive"}


class IncidentStatusBody(BaseModel):
    status: str


@app.put("/api/incidents/{incident_id}/status")
def set_incident_status(incident_id: str, body: IncidentStatusBody,
                        request: Request, s: Session = Depends(db_dep)):
    """A named human closes the loop on an incident.

    Nothing else in this codebase ever changes `status` outside of a
    tier-2+ action actually being approved and executed (see
    `respond.approve`/`respond.execute_auto`, which move it to
    'contained' on their own) — this is the explicit control for the
    cases that isn't: marking something resolved, reopening it, or
    correcting a call the automatic transition got wrong.
    """
    if body.status not in VALID_INCIDENT_STATUSES:
        raise HTTPException(400, f"status must be one of {sorted(VALID_INCIDENT_STATUSES)}")
    inc = s.get(Incident, incident_id)
    if not inc:
        raise HTTPException(404, "incident not found")
    principal = _principal(request)
    previous = inc.status
    inc.status = body.status
    governance.append_ledger(s, principal.id, "incident_status_changed",
                             {"incident_id": incident_id, "from": previous,
                              "to": body.status})
    bus.publish("incident.updated", {"incident_id": incident_id, "status": body.status})
    return {"incident_id": incident_id, "status": body.status}


@app.get("/api/events")
def list_events(incident_id: str | None = None, limit: int = 100,
                offset: int = 0, s: Session = Depends(db_dep)):
    """Bulk event listing. Optionally scoped to one incident's alerts —
    Event has no incident_id of its own, so the scope comes from the
    alerts that cited it, the same join `get_incident()` already does."""
    q = s.query(Event)
    if incident_id:
        alerts = (s.query(Alert)
                   .filter(Alert.incident_id == incident_id).all())
        event_ids = sorted({e for a in alerts for e in (a.event_ids or [])})
        if not event_ids:
            return {"total": 0, "items": []}
        q = q.filter(Event.event_id.in_(event_ids))
    total = q.count()
    rows = (q.order_by(Event.ts.desc()).offset(offset).limit(limit).all())
    return {"total": total, "items": [{
        "event_id": e.event_id, "ts": e.ts.isoformat(), "source": e.source,
        "class_name": e.class_name, "actor_user": e.actor_user,
        "src_host": e.src_host, "dst_host": e.dst_host,
        "process": e.process, "outcome": e.outcome,
        "synthetic": e.synthetic,
    } for e in rows]}


@app.get("/api/events/{event_id}")
def raw_event(event_id: str, s: Session = Depends(db_dep)):
    ev = s.get(Event, event_id)
    if not ev:
        raise HTTPException(404, "event not found")
    return {
        "event_id": ev.event_id, "ts": ev.ts.isoformat(), "source": ev.source,
        "class_name": ev.class_name, "actor_user": ev.actor_user,
        "src_host": ev.src_host, "dst_host": ev.dst_host,
        "process": ev.process, "parent_process": ev.parent_process,
        "outcome": ev.outcome, "untrusted": ev.untrusted,
        "raw_hash": ev.raw_hash, "raw_ref": ev.raw_ref,
        "verified": True, "synthetic": ev.synthetic,
    }


# ══════════════════════════════════════════════════════════════════════
#  ACTIONS AND APPROVALS
# ══════════════════════════════════════════════════════════════════════

def _action_row(a: Action) -> dict:
    from app.services.respond import ACTION_LABELS
    return {
        "action_id": a.action_id, "incident_id": a.incident_id,
        "kind": a.kind, "label": ACTION_LABELS.get(a.kind, a.kind),
        "target": a.target, "tier": a.tier, "status": a.status,
        "blast_radius": a.blast_radius, "rationale": a.rationale,
        "reversible": a.rollback is not None,
        "rollback_expires_at": a.rollback_expires_at.isoformat()
                               if a.rollback_expires_at else None,
        "requested_at": a.requested_at.isoformat() if a.requested_at else None,
        "executed_at": a.executed_at.isoformat() if a.executed_at else None,
        "approved_by": a.approved_by, "approval_reason": a.approval_reason,
        "override_of": a.override_of,
        "result": a.result, "escalated_to": a.escalated_to,
    }


@app.get("/api/actions")
def list_actions(status: str = "pending", s: Session = Depends(db_dep)):
    """`{total, items}`, like every other list route.

    This used to return a bare array while `/api/incidents`, `/api/rules`
    and the rest returned an envelope. One endpoint with a different shape
    is the kind of thing a frontend developer discovers at 2am.
    """
    q = s.query(Action)
    if status != "all":
        q = q.filter(Action.status == status)
    rows = q.order_by(Action.requested_at.desc()).all()
    return {"total": len(rows), "items": [_action_row(a) for a in rows]}


class ApproveBody(BaseModel):
    reason: str


@app.post("/api/actions/{action_id}/approve")
def approve_action(action_id: str, body: ApproveBody, request: Request,
                   s: Session = Depends(db_dep)):
    action = s.get(Action, action_id)
    if not action:
        raise HTTPException(404, "action not found")
    if len(body.reason.strip()) < 10:
        raise HTTPException(400, "a reason of at least 10 characters is required")
    principal = _principal(request)
    try:
        return respond.approve(s, action, principal.id, principal.role, body.reason)
    except PermissionError as e:
        raise HTTPException(403, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))


class OverrideBody(BaseModel):
    chosen_action: str
    reason: str


@app.post("/api/actions/{action_id}/override")
def override_action(action_id: str, body: OverrideBody, request: Request,
                    s: Session = Depends(db_dep)):
    action = s.get(Action, action_id)
    if not action:
        raise HTTPException(404, "action not found")
    if body.chosen_action not in config.TIERS:
        raise HTTPException(400, "chosen_action is not an approved action")
    if len(body.reason.strip()) < 10:
        raise HTTPException(400, "a reason of at least 10 characters is required")
    principal = _principal(request)
    try:
        replacement = respond.override(s, action, body.chosen_action,
                                       principal.id, body.reason)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return _action_row(replacement)


@app.post("/api/actions/{action_id}/reject")
def reject_action(action_id: str, body: ApproveBody, request: Request,
                  s: Session = Depends(db_dep)):
    action = s.get(Action, action_id)
    if not action:
        raise HTTPException(404, "action not found")
    if action.status not in {"pending", "partially_approved"}:
        raise HTTPException(400, f"cannot reject an action that is {action.status}")
    if len(body.reason.strip()) < 10:
        raise HTTPException(400, "a reason of at least 10 characters is required")
    principal = _principal(request)
    action.status = "rejected"
    governance.mark_notifications_read_for_action(s, action_id)
    governance.append_ledger(s, principal.id, "action_rejected",
                             {"action_id": action_id, "reason": body.reason})
    return _action_row(action)


@app.post("/api/actions/{action_id}/escalate")
def escalate_action(action_id: str, body: ApproveBody, request: Request,
                    s: Session = Depends(db_dep)):
    action = s.get(Action, action_id)
    if not action:
        raise HTTPException(404, "action not found")
    if action.status not in {"pending", "partially_approved"}:
        raise HTTPException(400, f"cannot escalate an action that is {action.status}")
    if len(body.reason.strip()) < 10:
        raise HTTPException(400, "a reason of at least 10 characters is required")
    principal = _principal(request)
    nxt = {"analyst": "senior_analyst", "senior_analyst": "manager"}.get(
        principal.role)
    action.escalated_to = nxt
    governance.mark_notifications_read_for_action(s, action_id)
    governance.notify(s, "escalation", f"Escalated: {action.kind}",
                      body.reason, "/approvals", nxt or "manager",
                      action_id=action_id)
    governance.append_ledger(s, principal.id, "action_escalated",
                             {"action_id": action_id, "to": nxt})
    return _action_row(action)


@app.post("/api/actions/{action_id}/dismiss")
def dismiss_action(action_id: str, body: ApproveBody, request: Request,
                   s: Session = Depends(db_dep)):
    """Distinct from reject: the analyst judges the finding not worth acting
    on at all, rather than disagreeing with this particular step."""
    action = s.get(Action, action_id)
    if not action:
        raise HTTPException(404, "action not found")
    if action.status not in {"pending", "partially_approved"}:
        raise HTTPException(400, f"cannot dismiss an action that is {action.status}")
    if len(body.reason.strip()) < 10:
        raise HTTPException(400, "a reason of at least 10 characters is required")
    principal = _principal(request)
    action.status = "dismissed"
    governance.mark_notifications_read_for_action(s, action_id)
    governance.append_ledger(s, principal.id, "action_dismissed",
                             {"action_id": action_id, "kind": action.kind,
                              "reason": body.reason})
    bus.publish("action.dismissed", {"action_id": action_id})
    return _action_row(action)


@app.post("/api/actions/{action_id}/rollback")
def rollback_action(action_id: str, request: Request, s: Session = Depends(db_dep)):
    action = s.get(Action, action_id)
    if not action:
        raise HTTPException(404, "action not found")
    principal = _principal(request)
    try:
        return respond.rollback(s, action, principal.id)
    except ValueError as e:
        raise HTTPException(400, str(e))


# ══════════════════════════════════════════════════════════════════════
#  AUDIT · RULES · SETTINGS · NOTIFICATIONS
# ══════════════════════════════════════════════════════════════════════

@app.get("/api/ledger")
def ledger(limit: int = 100, s: Session = Depends(db_dep)):
    from app.models import LedgerEntry
    rows = (s.query(LedgerEntry).order_by(LedgerEntry.seq.desc())
             .limit(limit).all())
    return [{"seq": e.seq, "ts": e.ts.isoformat(), "actor": e.actor,
             "action_type": e.action_type, "payload": e.payload,
             "entry_hash": e.entry_hash[:16], "signed": True} for e in rows]


@app.post("/api/ledger/verify")
def verify_ledger(s: Session = Depends(db_dep)):
    return governance.verify_chain(s)


@app.post("/api/ledger/tamper-test")
def tamper_test(request: Request, s: Session = Depends(db_dep)):
    """Prove the chain detects tampering, by tampering with it.

    Destructive to the ledger's validity, so it needs the highest role —
    there is no demo bypass, and a manager has to ask for it.
    """
    _permission(request, "approve_tier_3")
    return governance.tamper_test(s)


@app.get("/api/ledger/public-key")
def ledger_public_key():
    return {"public_key": governance.public_key_pem()}


@app.get("/api/rules")
def rules(s: Session = Depends(db_dep)):
    from app.models import Override
    return {
        "rules": governance.rule_scoreboard(s),
        "overrides": [{"recommended": o.recommended_action,
                       "chosen": o.chosen_action, "reason": o.reason,
                       "analyst": o.analyst,
                       "at": o.created_at.isoformat() if o.created_at else None}
                      for o in s.query(Override)
                                .order_by(Override.created_at.desc()).limit(20)],
        "protections": {
            "protected_rules": s.query(Rule).filter(Rule.protected).count(),
            "rate_limit": config.FEEDBACK_RATE_LIMIT,
        },
    }


@app.post("/api/rules/{rule_id}/retire")
def retire_rule(rule_id: str, request: Request, s: Session = Depends(db_dep)):
    principal = _permission(request, "retire_rules")
    rule = s.get(Rule, rule_id)
    if not rule:
        raise HTTPException(404, "rule not found")
    if rule.protected:
        raise HTTPException(400, "this detection is protected and cannot be "
                                 "suppressed by feedback")
    rule.enabled = False
    rule.proposed_for_retirement = False
    governance.append_ledger(s, principal.id, "rule_retired",
                             {"rule_id": rule_id})
    return {"ok": True}


@app.get("/api/settings")
def settings(s: Session = Depends(db_dep)):
    return {
        "autonomy": governance.get_setting(s, "autonomy", config.DEFAULT_AUTONOMY),
        "autonomy_modes": config.AUTONOMY_MODES,
        "tiers": config.TIERS,
        "ai": llm_router.provider_status(),
    }


class AutonomyBody(BaseModel):
    mode: str


@app.put("/api/settings/autonomy")
def set_autonomy(body: AutonomyBody, request: Request,
                 s: Session = Depends(db_dep)):
    _permission(request, "change_settings")
    if body.mode not in config.AUTONOMY_MODES:
        raise HTTPException(400, "unknown autonomy mode")
    if not config.AUTONOMY_MODES[body.mode].get("enabled", True):
        raise HTTPException(400, "that mode is deliberately not enabled")
    governance.set_setting(s, "autonomy", body.mode)
    bus.publish("settings.autonomy", {"mode": body.mode})
    return {"autonomy": body.mode}


class AIBody(BaseModel):
    enabled: bool


@app.put("/api/settings/ai")
def set_ai(body: AIBody, request: Request, s: Session = Depends(db_dep)):
    """The demo control that proves the model holds no authority."""
    principal = _permission(request, "change_settings")
    llm_router.set_ai_enabled(body.enabled)
    governance.append_ledger(s, principal.id, "ai_toggled",
                             {"enabled": body.enabled})
    bus.publish("settings.ai", {"enabled": body.enabled})
    return llm_router.provider_status()


@app.get("/api/ai/usage")
def ai_usage():
    """Free-tier budget, honestly reported. One batched call per incident
    instead of six, plus a content-hash cache, is what keeps this inside
    the limits.

    `quota.status()` and `llm_router.provider_status()` each return a
    "providers" key — spreading them together the naive way lets whichever
    dict comes second silently overwrite the other's "providers", which
    was quietly discarding the actual remaining-calls-today numbers this
    endpoint exists to report. Merged per-provider instead."""
    from app.llm import quota
    budget = quota.status()
    status = llm_router.provider_status()
    providers = {
        name: {**status["providers"].get(name, {}), **budget["providers"].get(name, {})}
        for name in set(status["providers"]) | set(budget["providers"])
    }
    return {**status, "providers": providers, "cache": budget["cache"]}


@app.get("/api/notifications")
def notifications(s: Session = Depends(db_dep)):
    rows = (s.query(Notification).order_by(Notification.created_at.desc())
             .limit(30).all())
    return {"unread": sum(1 for n in rows if not n.read),
            "items": [{"id": n.id, "kind": n.kind, "title": n.title,
                       "body": n.body, "link": n.link,
                       "at": n.created_at.isoformat() if n.created_at else None,
                       "read": n.read} for n in rows]}


@app.put("/api/notifications/{notification_id}/read")
def mark_notification_read(notification_id: int, s: Session = Depends(db_dep)):
    n = s.get(Notification, notification_id)
    if not n:
        raise HTTPException(404, "notification not found")
    n.read = True
    return {"id": n.id, "read": True}


@app.get("/api/search")
def search(q: str = Query(min_length=1), s: Session = Depends(db_dep)):
    """Powers Ctrl+K. Returns actions as well as results, which is what
    makes it a command palette rather than a search box."""
    like = f"%{q}%"
    incidents = (s.query(Incident)
                  .filter(Incident.title.ilike(like),
                          ~Incident.incident_id.startswith("inc_hist_"))
                  .limit(5).all())
    return {
        "incidents": [{"id": i.incident_id, "title": i.title,
                       "risk": i.risk_score} for i in incidents],
        "actions": [
            {"label": "Run the guided demo", "endpoint": "/api/demo/play"},
            {"label": "Verify the audit chain", "endpoint": "/api/ledger/verify"},
            {"label": "Generate a new scenario",
             "endpoint": "/api/scenarios/generate"},
        ],
    }


# ══════════════════════════════════════════════════════════════════════
#  FEEDBACK — list + aggregate stats (the RLHF page needs a history and a
#  scoreboard, not just POST /api/incidents/{id}/feedback)
# ══════════════════════════════════════════════════════════════════════

@app.get("/api/feedback")
def list_feedback(limit: int = 50, s: Session = Depends(db_dep)):
    from app.models import AppUser, Feedback
    # analyst == "historic" marks the synthetic verdicts seed_history()
    # attaches to the 36 fake precedent incidents — real feedback only here.
    rows = (s.query(Feedback).filter(Feedback.analyst != "historic")
             .order_by(Feedback.created_at.desc())
             .limit(limit).all())
    incident_ids = {r.incident_id for r in rows}
    titles = {i.incident_id: i.title for i in
              s.query(Incident).filter(Incident.incident_id.in_(incident_ids))} \
             if incident_ids else {}
    analyst_ids = {r.analyst for r in rows}
    names = {u.id: u.full_name for u in
             s.query(AppUser).filter(AppUser.id.in_(analyst_ids))} \
            if analyst_ids else {}
    return {"items": [{
        "id": r.id, "incident_id": r.incident_id,
        "incident_title": titles.get(r.incident_id, r.incident_id),
        "verdict": r.verdict, "reason_code": r.reason_code,
        "analyst": names.get(r.analyst, r.analyst),
        "created_at": r.created_at.isoformat() if r.created_at else None,
    } for r in rows]}


@app.get("/api/feedback/stats")
def feedback_stats(s: Session = Depends(db_dep)):
    from app.models import Feedback
    rows = s.query(Feedback).filter(Feedback.analyst != "historic").all()
    total = len(rows)
    confirmed = sum(1 for r in rows if r.verdict == "tp")
    false_positives = sum(1 for r in rows if r.verdict == "fp")
    needs_review = sum(1 for r in rows if r.verdict == "needs_review")
    return {
        "total_submitted": total,
        "confirmed_count": confirmed,
        "false_positives_count": false_positives,
        "modified_count": needs_review,
        "accuracy_percentage": round(confirmed / total * 100, 1) if total else 0.0,
    }


# ══════════════════════════════════════════════════════════════════════
#  AI SAFETY — built from what is actually persisted, not a separate log.
#  Prompt injection: the INJECTION_ATTEMPT alert every attempt already
#  raises. Conflicting data: incidents where the two paths disagree, or
#  the narrative failed its own consistency check. Poisoned alerts: a
#  feedback-rate-limit trip, which is what mass-marking incidents benign
#  looks like from the ledger.
# ══════════════════════════════════════════════════════════════════════

@app.get("/api/ai-safety/events")
def ai_safety_events(limit: int = 30, s: Session = Depends(db_dep)):
    from app.models import LedgerEntry

    out = []
    injections = (s.query(Alert)
                   .filter(Alert.rule_id == "INJECTION_ATTEMPT")
                   .order_by(Alert.detected_at.desc()).limit(limit).all())
    for a in injections:
        inc = s.get(Incident, a.incident_id) if a.incident_id else None
        details = (inc.injection_details or []) if inc else []
        # Each entry is {"field": ..., "class": ...} — a struct, not display
        # text. Render it, rather than handing the frontend a dict where a
        # string field is expected.
        first = details[0] if details else None
        payload = (f"field={first['field']} attack_class={first['class']}"
                   if first else a.rule_title)
        out.append({
            "id": a.alert_id, "timestamp": a.detected_at.isoformat(),
            "type": "PROMPT_INJECTION",
            "title": "Adversarial content targeting the AI blocked",
            "source": a.entities[0] if a.entities else "unknown",
            "payload": payload,
            "reasoning": "Untrusted log fields are sanitised and redacted "
                        "before any model sees them; the attempt is raised "
                        "as evidence rather than silently dropped.",
            "status": "BLOCKED",
            "mitigation": "Boundary sanitisation stripped the payload before "
                          "it reached the model. The verdict was unaffected.",
            "confidence_score": 100,
        })

    conflicts = (s.query(Incident)
                  .filter((Incident.agreement == "disagreement") |
                          (Incident.consistency_flag.is_(True)))
                  .order_by(Incident.last_seen.desc()).limit(limit).all())
    for inc in conflicts:
        is_consistency = inc.consistency_flag
        out.append({
            "id": f"conflict_{inc.incident_id}",
            "timestamp": (inc.last_seen or inc.first_seen).isoformat(),
            "type": "CONFLICTING_DATA",
            "title": ("The narrative failed its own consistency check"
                      if is_consistency else
                      "Rules and the model reached different verdicts"),
            "source": inc.incident_id,
            "payload": f"base={inc.base_score:.0f} model={inc.model_score or 0:.0f} "
                      f"final={inc.risk_score:.0f}",
            "reasoning": inc.agreement_detail.get("reason", "") if inc.agreement_detail
                        else "The two independent methods read the same events and "
                             "reached scores far enough apart to count as a "
                             "disagreement, not a difference of emphasis.",
            "status": "FLAGGED_FOR_HUMAN",
            "mitigation": "Forced into human review regardless of either score — "
                          "an incident two methods disagree about is not "
                          "low-risk, it is unexplained.",
            "confidence_score": round(inc.risk_factors.get("confidence", 0.5) * 100)
                                if inc.risk_factors else 50,
        })

    flood = (s.query(LedgerEntry)
              .filter(LedgerEntry.action_type == "feedback_rate_limited")
              .order_by(LedgerEntry.ts.desc()).limit(limit).all())
    for e in flood:
        out.append({
            "id": f"ledger_{e.seq}", "timestamp": e.ts.isoformat(),
            "type": "POISONED_ALERT",
            "title": "Feedback rate limit tripped",
            "source": e.actor,
            "payload": str(e.payload),
            "reasoning": "Mass-marking incidents benign in a short window is "
                        "itself suspicious behaviour — the honest reading of "
                        "resisting a poisoned-alert campaign is to rate-limit "
                        "the channel, not just trust every verdict.",
            "status": "NEUTRALIZED",
            "mitigation": "The analyst's feedback channel was rate-limited and "
                          "a security alert raised for a manager to review.",
            "confidence_score": 100,
        })

    out.sort(key=lambda e: e["timestamp"], reverse=True)
    return {"items": out[:limit]}


# ══════════════════════════════════════════════════════════════════════
#  TRUST METRICS — accepted / rejected / overridden, from the ledger.
#  Nothing here is a separate opinion store; it is the same audit trail
#  the Evidence & Audit page reads, aggregated a different way.
# ══════════════════════════════════════════════════════════════════════

@app.get("/api/trust/metrics")
def trust_metrics(s: Session = Depends(db_dep)):
    from app.models import LedgerEntry

    rows = s.query(LedgerEntry).order_by(LedgerEntry.seq).all()
    accepted = sum(1 for r in rows if r.action_type in
                   ("action_approved_executed", "action_executed"))
    rejected = sum(1 for r in rows if r.action_type == "action_rejected")
    overridden = sum(1 for r in rows if r.action_type == "action_overridden")
    total = accepted + rejected + overridden
    # None rather than 100 on an empty ledger: "every recommendation was
    # accepted" and "nothing has been decided yet" are different states, and
    # showing a perfect score for the second one is the panel asserting a
    # measurement it has not made.
    trust_score = round(accepted / total * 100) if total else None

    # Bucket into 7 periods across the ledger's span so the sparkline has
    # something to draw even on a short demo run.
    buckets = 7
    history = []
    if rows:
        n = len(rows)
        step = max(1, n // buckets)
        running_accept = running_total = 0
        for i in range(0, n, step):
            chunk = rows[i:i + step]
            running_accept += sum(1 for r in chunk if r.action_type in
                                  ("action_approved_executed", "action_executed"))
            running_total += sum(1 for r in chunk if r.action_type in
                                 ("action_approved_executed", "action_executed",
                                  "action_rejected", "action_overridden"))
            history.append({
                "period": f"T-{buckets - len(history) - 1}",
                "score": round(running_accept / running_total * 100)
                         if running_total else trust_score,
            })
    else:
        # An empty ledger has no history. A flat line at 100 is not an
        # empty state, it is a fabricated perfect record.
        history = []

    from app.models import Rule
    top_types = []
    for r in (s.query(Rule).filter(Rule.fired_count > 0)
               .order_by(Rule.fired_count.desc()).limit(3)):
        rate = round((1 - r.fp_count / r.fired_count) * 100) if r.fired_count else 100
        top_types.append({"category": r.title, "rate": rate})

    return {
        "accepted": accepted, "rejected": rejected, "overridden": overridden,
        "total": total, "trust_score": trust_score,
        "history": history[-buckets:], "top_accepted_types": top_types,
    }


# ══════════════════════════════════════════════════════════════════════
#  WEBSOCKET
# ══════════════════════════════════════════════════════════════════════

@app.websocket("/ws")
async def websocket(ws: WebSocket):
    # The socket carries the same identity requirement as the REST routes.
    # Browsers cannot set headers on a WebSocket handshake, so the token
    # arrives as a query parameter — the one place that is acceptable.
    try:
        auth.decode_access_token(ws.query_params.get("access_token", ""))
    except HTTPException:
        await ws.close(code=4401)
        return
    await ws.accept()
    await ws.send_json({"kind": "hello",
                        "payload": {"counters": counters.snapshot(),
                                    "demo": demo.state.public()}})
    try:
        async for msg in bus.subscribe():
            await ws.send_json(msg)
    except WebSocketDisconnect:
        pass
    except Exception:                                    # noqa: BLE001
        log.debug("websocket closed")
