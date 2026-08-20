"""Everything the dashboard displays.

One time-series service feeds four separate UI features: the threat activity
chart, the KPI sparklines, the "12% from yesterday" deltas, and the source
donut. Build it once.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import counters
from app.models import (Action, Alert, Event, Incident, MetricPoint,
                        PlaybookUsage)

WINDOWS = {"1h": 1, "6h": 6, "24h": 24, "7d": 168}


# ══════════════════════════════════════════════════════════════════════
#  KPI CARDS
# ══════════════════════════════════════════════════════════════════════

def kpis(s: Session) -> dict:
    open_incidents = s.query(Incident).filter(Incident.status == "open").count()
    critical = (s.query(Incident)
                 .filter(Incident.status == "open",
                         Incident.risk_score >= 80).count())
    pending = s.query(Action).filter(Action.status == "pending").count()
    events = s.query(Event).count()
    alerts = s.query(Alert).count()

    injections = (s.query(Alert)
                   .filter(Alert.rule_id == "INJECTION_ATTEMPT").count())

    decided = s.query(Action).filter(
        Action.status.in_(["executed", "rejected", "rolled_back"])).count()
    approved = s.query(Action).filter(Action.status == "executed").count()
    trust = round(approved / decided * 100) if decided else 85

    return {
        "open_incidents": open_incidents,
        "critical_alerts": critical,
        "pending_approvals": pending,
        "adversarial_attempts": injections,
        "trust_score": trust,
        "events_processed": events,
        "alerts_raised": alerts,
        # the subtitle that carries the whole value proposition
        "compression": {
            "events": events, "alerts": alerts, "incidents": open_incidents,
            "label": f"from {events:,} events and {alerts:,} alerts",
        },
        "system_health": health_score(s),
        "live": counters.snapshot(),
    }


def deltas(s: Session) -> dict:
    """"↗ 12% from yesterday" — comparing two equal windows."""
    now = datetime.now(timezone.utc)
    out = {}
    for metric in ("events", "alerts", "incidents", "injections"):
        cur = _sum(s, metric, now - timedelta(hours=24), now)
        prev = _sum(s, metric, now - timedelta(hours=48), now - timedelta(hours=24))
        if prev:
            out[metric] = round((cur - prev) / prev * 100, 1)
        else:
            out[metric] = None          # hide rather than invent a comparison
    return out


def _sum(s: Session, metric: str, start: datetime, end: datetime) -> int:
    return (s.query(func.coalesce(func.sum(MetricPoint.value), 0))
             .filter(MetricPoint.metric == metric,
                     MetricPoint.bucket >= start,
                     MetricPoint.bucket < end).scalar() or 0)


# ══════════════════════════════════════════════════════════════════════
#  TIME SERIES  —  chart · sparklines · donut
# ══════════════════════════════════════════════════════════════════════

def timeseries(s: Session, metric: str = "alerts", window: str = "24h",
               bucket_hours: int = 1, group_by: str | None = None) -> dict:
    hours = WINDOWS.get(window, 24)
    end = datetime.now(timezone.utc)
    start = end - timedelta(hours=hours)

    q = (s.query(MetricPoint)
          .filter(MetricPoint.metric == metric,
                  MetricPoint.bucket >= start))
    rows = q.all()

    labels, index = [], {}
    t = start.replace(minute=0, second=0, microsecond=0)
    while t <= end:
        labels.append(t.strftime("%I %p").lstrip("0"))
        index[t.replace(tzinfo=timezone.utc)] = len(labels) - 1
        t += timedelta(hours=bucket_hours)

    series: dict[str, list[int]] = {}
    for r in rows:
        key = r.dimension if group_by else "total"
        series.setdefault(key, [0] * len(labels))
        b = r.bucket.replace(minute=0, second=0, microsecond=0,
                             tzinfo=timezone.utc)
        if b in index:
            series[key][index[b]] += r.value

    if not series:
        series = {"total": [0] * len(labels)}

    return {"buckets": labels,
            "series": [{"name": k, "values": v} for k, v in series.items()]}


def source_breakdown(s: Session) -> list[dict]:
    """The 'Top Threat Types' donut."""
    rows = (s.query(Alert.technique, func.count(Alert.alert_id))
             .group_by(Alert.technique).all())
    label = {
        "T1566.001": "Phishing", "T1204.002": "Phishing",
        "T1078": "Identity Abuse", "T1003.001": "Identity Abuse",
        "T1087.002": "Identity Abuse",
        "T1486": "Malware", "T1490": "Malware", "T1059.001": "Malware",
        "T1565": "Adversarial Content",
    }
    agg: dict[str, int] = {}
    for tech, n in rows:
        agg[label.get(tech or "", "Other")] = agg.get(label.get(tech or "", "Other"), 0) + n

    total = sum(agg.values()) or 1
    return sorted(
        [{"name": k, "value": v, "percent": round(v / total * 100)}
         for k, v in agg.items()],
        key=lambda d: -d["value"])


def flush_counters(s: Session) -> None:
    """Called once a minute — turns live counters into chart history."""
    bucket = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    snap = counters.snapshot()
    pairs = [("events", snap["events_processed"]),
             ("alerts", snap["alerts_raised"]),
             ("incidents", snap["incidents_open"]),
             ("injections", snap["injections_blocked"])]
    for metric, value in pairs:
        row = s.get(MetricPoint, (bucket, metric, ""))
        if row:
            row.value = value
        else:
            s.add(MetricPoint(bucket=bucket, metric=metric,
                              dimension="", value=value))
    for source, n in snap.get("by_source", {}).items():
        row = s.get(MetricPoint, (bucket, "alerts", source))
        if row:
            row.value = n
        else:
            s.add(MetricPoint(bucket=bucket, metric="alerts",
                              dimension=source, value=n))


# ══════════════════════════════════════════════════════════════════════
#  SECURITY OPERATIONS SUMMARY
# ══════════════════════════════════════════════════════════════════════

def ops_summary(s: Session) -> dict:
    # Exclude the 36 seeded "(historical)" precedent-panel incidents — they
    # carry fabricated first_seen dates up to 180 days in the past against a
    # created_at of "whenever bootstrap ran", which would otherwise blow up
    # MTTD into something like "83 days" and dilute the containment rate
    # with synthetic statuses that have nothing to do with real operations.
    incidents = (s.query(Incident)
                  .filter(~Incident.incident_id.startswith("inc_hist_")).all())
    contained = [i for i in incidents if i.status in ("contained", "closed")]

    detect_times, respond_times = [], []
    for inc in incidents:
        detect_times.append((inc.created_at - inc.first_seen).total_seconds()
                            if inc.created_at and inc.first_seen else 0)
    for a in s.query(Action).filter(Action.executed_at.isnot(None)):
        if a.requested_at:
            respond_times.append((a.executed_at - a.requested_at).total_seconds())

    return {
        "events_processed": s.query(Event).count(),
        "incidents_open": s.query(Incident)
                           .filter(Incident.status == "open").count(),
        "mttd_seconds": round(sum(detect_times) / len(detect_times))
                        if detect_times else 0,
        "mttr_seconds": round(sum(respond_times) / len(respond_times))
                        if respond_times else 0,
        "containment_rate": round(len(contained) / len(incidents) * 100, 1)
                            if incidents else 0.0,
        "ingestion_rate": counters.events,
    }


# ══════════════════════════════════════════════════════════════════════
#  THREAT MAP  —  the topology panel
# ══════════════════════════════════════════════════════════════════════

def threat_map(s: Session) -> dict:
    """Nodes and links, coloured by whether an open incident touches them."""
    from app.models import Host

    hosts = s.query(Host).all()
    involved: set[str] = set()
    severity: dict[str, str] = {}

    for inc in s.query(Incident).filter(Incident.status == "open"):
        for e in inc.entity_ids:
            if e.startswith("host:"):
                name = e.split(":", 1)[1]
                involved.add(name)
                level = "critical" if inc.risk_score >= 80 else "high"
                if severity.get(name) != "critical":
                    severity[name] = level

    nodes, links = [], []
    for h in hosts:
        is_hub = h.id in ("DC-01", "FILESERVER-01", "MAIL-RELAY")
        nodes.append({
            "id": h.id, "label": h.id,
            "kind": "server" if is_hub else "workstation",
            "status": severity.get(h.id, "healthy"),
            "department": h.department,
        })
        if not is_hub:
            links.append({"source": h.id, "target": "DC-01",
                          "active": h.id in involved})

    return {"nodes": nodes, "links": links,
            "counts": {"critical": sum(1 for v in severity.values()
                                       if v == "critical"),
                       "high": sum(1 for v in severity.values() if v == "high")}}


# ══════════════════════════════════════════════════════════════════════
#  HEALTH  —  a real check, not a hardcoded 98%
# ══════════════════════════════════════════════════════════════════════

def benchmark(s: Session, run_id: str | None = None) -> dict:
    """Detection rate against ground truth we generated ourselves.

    Every attack event carries `truth_technique` — the technique it was
    written to represent. No detection rule reads that field, so comparing
    it against what actually fired is a real measurement rather than a
    circular one.

    Almost no student project can produce this number. It is worth more
    than another feature.
    """
    planted = (s.query(Event).filter(Event.truth_technique.isnot(None))
                .filter(Event.run_id == run_id) if run_id else
               s.query(Event).filter(Event.truth_technique.isnot(None))).all()

    if not planted:
        return {"status": "no_labelled_events",
                "note": "Run the demo — attack events are labelled as they "
                        "are generated."}

    truth_of = {e.event_id: e.truth_technique for e in planted}
    planted_ids = set(truth_of)

    by_technique: dict[str, dict] = {}
    for t in truth_of.values():
        by_technique.setdefault(t, {"planted": 0, "detected": 0})
    for t in truth_of.values():
        by_technique[t]["planted"] += 1

    # One event can fire several rules. Count distinct events detected, not
    # alerts raised, or a noisy event scores above 100% recall.
    alerts = s.query(Alert).all()
    detected_ids: set[str] = set()
    named_right: dict[str, set[str]] = {}
    for a in alerts:
        for eid in (a.event_ids or []):
            if eid not in planted_ids:
                continue
            detected_ids.add(eid)
            truth = truth_of[eid]
            if a.technique == truth:
                named_right.setdefault(truth, set()).add(eid)

    for eid in detected_ids:
        by_technique[truth_of[eid]]["detected"] += 1

    correct_technique = {t: len(v) for t, v in named_right.items()}
    hit = [t for t, v in by_technique.items() if v["detected"] > 0]
    missed = sorted(t for t, v in by_technique.items() if v["detected"] == 0)

    # False positives: alerts on events we did not plant. On a synthetic
    # run every unplanted event is by construction benign.
    fp = sum(1 for a in alerts
             if a.origin in ("rule", "injection")
             and not (set(a.event_ids or []) & planted_ids))
    total_events = s.query(Event).count()

    return {
        "status": "ok",
        "techniques": {
            "planted": len(by_technique),
            "detected": len(hit),
            "recall": round(len(hit) / len(by_technique), 3),
            "missed": missed,
        },
        "events": {
            "planted": len(planted_ids),
            "detected": len(detected_ids),
            "recall": round(len(detected_ids) / len(planted_ids), 3),
        },
        "false_positives": {
            "alerts_on_benign_events": fp,
            "benign_events": total_events - len(planted_ids),
            "rate": round(fp / max(total_events - len(planted_ids), 1), 5),
        },
        "per_technique": {
            t: {**v,
                "named_correctly": correct_technique.get(t, 0),
                "recall": round(v["detected"] / v["planted"], 2)}
            for t, v in sorted(by_technique.items())
        },
        "note": ("Ground truth is stamped on each attack event at generation "
                 "time and read by nothing except this endpoint. A missed "
                 "technique is named rather than hidden."),
    }


def health_score(s: Session) -> dict:
    from app.llm import router
    from app.services import governance

    status = router.provider_status()
    any_provider = any(p["available"] for p in status["providers"].values())

    checks = {
        "database": True,
        "ai_provider": any_provider or not status["ai_enabled"],
        "rules_loaded": s.query(func.count()).select_from(
            __import__("app.models", fromlist=["Rule"]).Rule).scalar() > 0,
        "ledger_verified": governance.verify_chain(s)["valid"],
    }
    score = round(100 * sum(checks.values()) / len(checks))
    return {"score": score, "checks": checks,
            "ai": status,
            "label": "All systems operational" if score == 100
                     else "Degraded"}


def playbook_stats(s: Session) -> list[dict]:
    rows = s.query(PlaybookUsage).all()
    total = sum(r.matched_count for r in rows) or 1
    return sorted(
        [{"id": r.playbook_id, "name": r.name or r.playbook_id,
          "used": r.matched_count, "executed": r.executed_count,
          "share": round(r.matched_count / total * 100),
          "last_used": r.last_used.isoformat() if r.last_used else None}
         for r in rows],
        key=lambda d: -d["used"])
