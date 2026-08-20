"""Path A — the deterministic core: ingest → detect → correlate → score.

**No model is called from this file, and nothing in it waits on a network
request.** It must produce a correct verdict with the AI switched off, and
`scripts/verify_assist.py` proves that it does.

One honest exception, at the very end: `score_incident()` finishes by
calling `assist.reconcile()`. That is not a model call — it is the function
that compares this file's answer against path B's, if path B has produced
one, and it returns this file's answer unchanged when it has not. Scores are
finalised in exactly one place, and this is how they get there.

What this file hands to path B, and what it keeps:

    detection   — Sigma rules decide. The ANOMALY BASELINE additionally
                  marks events that are merely unusual, which is the queue
                  the model reviews.
    correlation — the entity graph clusters. Hubs and process names cannot
                  bridge, which is what stops an ordinary day collapsing
                  into one incident.
    scoring     — `base_score` is arithmetic, and it is stored, so "what
                  would this have been without the AI" stays answerable.
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta

import networkx as nx
from sqlalchemy.orm import Session
from ulid import ULID

from app import config
from app.db import get_session
from app.models import Alert, Event, Incident, Rule

log = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════════
#  DETECTION RULES
#  Sigma-shaped, but evaluated in-process. Loading the full community
#  library is a bootstrap step; these are the ones the demo depends on.
# ══════════════════════════════════════════════════════════════════════

@dataclass
class DetectionRule:
    rule_id: str
    title: str
    severity: str
    technique: str
    tactic: str
    match: dict
    protected: bool = False          # cannot be retired by feedback


RULES: list[DetectionRule] = [
    DetectionRule("office_spawns_script", "Office application spawned a script engine",
                  "high", "T1059.001", "TA0002",
                  {"parent_process": r"WINWORD|EXCEL|POWERPNT",
                   "process": r"powershell|cmd|wscript"}),
    DetectionRule("encoded_powershell", "PowerShell with an encoded command",
                  "high", "T1059.001", "TA0002",
                  {"untrusted.cmdline": r"-enc|-EncodedCommand|-e "}),
    DetectionRule("suspicious_attachment", "Macro-enabled attachment delivered",
                  "medium", "T1566.001", "TA0001",
                  {"untrusted.filename": r"\.docm$|\.xlsm$|\.pptm$"}),
    DetectionRule("scheduled_task_created", "Scheduled task created",
                  "medium", "T1053.005", "TA0003",
                  {"untrusted.cmdline": r"schtasks|New-ScheduledTask"}),
    DetectionRule("lsass_access", "Credential material read from process memory",
                  "critical", "T1003.001", "TA0006",
                  {"untrusted.cmdline": r"lsass|MiniDump|comsvcs"},
                  protected=True),
    # "first_time_auth" used to live here as a high-severity rule. It was
    # removed, and the removal is worth explaining because it is the single
    # most useful thing we learned building this.
    #
    # Measured against a realistic working day it fired 24 times in 45
    # minutes — every person who sat at a colleague's desk, every account
    # touching a file server for the first time this week. Those 24 alerts
    # then correlated into one incident scoring 98, on a day when nothing
    # happened at all.
    #
    # A signal that fires on ordinary behaviour is not a detection. It is an
    # anomaly, and it belongs in the baseline where it is one oddity among
    # several and has to be corroborated before anyone is told. See
    # `Baseline.oddities()`. The attack is still caught, because what makes
    # the attacker's authentication interesting was never that it was the
    # first one — it was that it followed credential theft.
    DetectionRule("account_discovery", "Domain account enumeration",
                  "medium", "T1087.002", "TA0007",
                  {"untrusted.cmdline": r"net user|net group|Get-ADUser"}),
    # Evasion had no rule at all, which made one of the seven canonical
    # stages unreachable however the attack behaved. Turning the defences
    # off is also the step most worth catching, because everything after it
    # is quieter.
    DetectionRule("defence_impairment", "Endpoint protection disabled",
                  "critical", "T1562.001", "TA0005",
                  {"untrusted.cmdline":
                   r"DisableRealtimeMonitoring|Set-MpPreference.*\$true|"
                   r"wevtutil\s+cl|Stop-Service.*(Defender|Sense)"},
                  protected=True),
    DetectionRule("shadow_copy_deletion", "Shadow copies deleted — recovery inhibited",
                  "critical", "T1490", "TA0040",
                  {"untrusted.cmdline": r"vssadmin.*delete|wbadmin.*delete"},
                  protected=True),
    DetectionRule("mass_encryption", "Mass file encryption behaviour",
                  "critical", "T1486", "TA0040",
                  {"untrusted.cmdline": r"encrypt"},
                  protected=True),
    DetectionRule("smb_admin_share", "Access to an administrative share",
                  "high", "T1021.002", "TA0008",
                  {"outcome": r"smb_session"}),
    DetectionRule("c2_beacon", "Connection to an unfamiliar external address",
                  "medium", "T1071.001", "TA0011",
                  {"class_name": r"network_activity", "_external": True}),
]

RULES_BY_ID = {r.rule_id: r for r in RULES}

KNOWN_HOSTS = re.compile(r"^(WORKSTATION|SERVER|FILESERVER|DC|MAIL)", re.I)


def _get(ev: dict, path: str):
    if path.startswith("untrusted."):
        return (ev.get("untrusted") or {}).get(path.split(".", 1)[1])
    return ev.get(path)


def evaluate(ev: dict) -> list[DetectionRule]:
    hits = []
    for rule in RULES:
        ok = True
        for key, pattern in rule.match.items():
            if key == "_external":
                dst = ev.get("dst_ip") or ""
                if not dst or KNOWN_HOSTS.match(ev.get("dst_host") or ""):
                    ok = False
                    break
                continue
            value = _get(ev, key)
            if not value or not re.search(pattern, str(value), re.I):
                ok = False
                break
        if ok:
            hits.append(rule)
    return hits


# ══════════════════════════════════════════════════════════════════════
#  ANOMALY BASELINE
#
#  Rules catch what somebody already thought to write down. This catches
#  what is merely *unusual*, and it is entirely deterministic — counting,
#  not judgement.
#
#  It exists to answer a fair question: out of thirty thousand events, how
#  did six become an incident? Rules explain the six. This explains the
#  handful in between — odd enough to be worth a look, not odd enough for
#  anyone to have written a rule. Those are the only events the model is
#  ever shown.
# ══════════════════════════════════════════════════════════════════════

class Baseline:
    """What normal looks like here, learned by counting."""

    WARMUP = 300          # below this we have no idea what normal is

    def __init__(self) -> None:
        self.total = 0
        self.process: dict[str, int] = {}
        self.pair: dict[tuple[str, str], int] = {}      # parent → child
        self.user_host: dict[tuple[str, str], int] = {}
        self.user_hour: dict[tuple[str, int], int] = {}
        self.dst: dict[str, int] = {}
        self.user_events: dict[str, int] = {}
        self.seen_auth: set[tuple[str, str]] = set()

    def clear(self) -> None:
        self.__init__()

    def observe(self, ev: dict) -> None:
        self.total += 1
        u = ev.get("actor_user")
        p = (ev.get("process") or "").lower()
        pp = (ev.get("parent_process") or "").lower()

        if p:
            self.process[p] = self.process.get(p, 0) + 1
        if p and pp:
            self.pair[(pp, p)] = self.pair.get((pp, p), 0) + 1
        if u:
            self.user_events[u] = self.user_events.get(u, 0) + 1
            self.user_hour[(u, ev["ts"].hour)] = \
                self.user_hour.get((u, ev["ts"].hour), 0) + 1
            if ev.get("dst_host"):
                key = (u, ev["dst_host"])
                self.user_host[key] = self.user_host.get(key, 0) + 1
                if ev.get("class_name") == "authentication":
                    self.seen_auth.add(key)
        if ev.get("dst_ip"):
            self.dst[ev["dst_ip"]] = self.dst.get(ev["dst_ip"], 0) + 1

    def oddities(self, ev: dict) -> list[str]:
        """Independent reasons this event stands out. Plain sentences,
        because they are shown to a person as well as to the model."""
        if self.total < self.WARMUP:
            return []

        out: list[str] = []
        u = ev.get("actor_user")
        p = (ev.get("process") or "").lower()
        pp = (ev.get("parent_process") or "").lower()

        if p and self.process.get(p, 0) <= 2:
            out.append(f"process {p} has run {self.process.get(p, 0)} times "
                       f"in {self.total} events")
        if p and pp and self.pair.get((pp, p), 0) <= 1:
            out.append(f"{pp} has not started {p} before")
        if u and ev.get("dst_host") and \
                self.user_host.get((u, ev["dst_host"]), 0) <= 1 and \
                self.user_events.get(u, 0) >= 8:
            out.append(f"{u} has not reached {ev['dst_host']} before")
        if u and self.user_hour.get((u, ev["ts"].hour), 0) <= 1 and \
                self.user_events.get(u, 0) >= 12:
            out.append(f"{u} is not usually active at "
                       f"{ev['ts'].strftime('%H:%M')}")
        if ev.get("dst_ip") and self.dst.get(ev["dst_ip"], 0) <= 1 and \
                not KNOWN_HOSTS.match(ev.get("dst_host") or ""):
            out.append(f"first connection to {ev['dst_ip']} from anywhere")
        if ev.get("outcome") in ("failure", "denied", "blocked"):
            out.append(f"the operation was {ev['outcome']}")

        # First-ever authentication. On its own this is somebody at a
        # colleague's desk, which is why it is an oddity here rather than a
        # rule. Combined with anything else on this list it is worth a look.
        if u and ev.get("dst_host") and ev.get("class_name") == "authentication":
            if (u, ev["dst_host"]) not in self.seen_auth and \
                    self.user_events.get(u, 0) >= 8:
                out.append(f"{u} has never authenticated to "
                           f"{ev['dst_host']} before")
        return out


baseline = Baseline()

# Events that were odd but matched no rule. This is the queue the model
# reviews — bounded, so a burst of noise cannot turn into a burst of calls.
_candidates: list[dict] = []


class AlertRate:
    """Is somebody burying the signal?

    Generating a flood of harmless alerts to hide one real one is an old
    technique and it still works, because past a few hundred rows the
    analyst stops reading. Deterministic — a running mean, and a ratio.
    """

    # Start from a small constant rather than from whatever arrives first.
    # Seeding the baseline with `max(baseline, rate)` meant a large opening
    # batch set the bar so high that nothing afterwards could be eight times
    # it — so whether flooding was detected at all depended on batch
    # ordering, which is not a property to discover on stage.
    SEED_BASELINE = 5.0

    def __init__(self) -> None:
        self.window: list[datetime] = []
        self.baseline: float = self.SEED_BASELINE
        self.samples: int = 0
        self.warmup: list[int] = []
        self.raised: bool = False

    def clear(self) -> None:
        self.__init__()

    def observe(self, n: int, at: datetime) -> dict | None:
        self.window.extend([at] * n)
        cutoff = at - timedelta(minutes=5)
        self.window = [t for t in self.window if t >= cutoff]
        rate = len(self.window)

        self.samples += 1
        if self.samples <= 3 and not self.raised:
            # Median, not max — one huge batch during warm-up should not be
            # able to define "normal" for the rest of the run.
            self.warmup.append(rate)
            mid = sorted(self.warmup)[len(self.warmup) // 2]
            self.baseline = max(self.SEED_BASELINE, min(mid, rate))
            # A flood arriving during warm-up is still a flood, so fall
            # through to the check rather than returning early.
            if not (rate >= config.FLOOD_MIN_ALERTS and
                    rate > self.SEED_BASELINE * config.FLOOD_MULTIPLIER):
                return None
            self.baseline = self.SEED_BASELINE

        if rate >= config.FLOOD_MIN_ALERTS and \
                rate > max(self.baseline, 1) * config.FLOOD_MULTIPLIER:
            self.raised = True
            flood = {
                "alerts_in_window": rate,
                "baseline": round(self.baseline, 1),
                "ratio": round(rate / max(self.baseline, 1), 1),
                "message": (f"{rate} alerts in five minutes against a "
                            f"baseline of {self.baseline:.0f}. A flood this "
                            f"size is worth treating as an event in itself — "
                            f"it is a known way of hiding one real alert "
                            f"among many harmless ones."),
            }
            self.baseline = rate * 0.5   # adapt, so we say it once
            return flood

        self.baseline = self.baseline * 0.8 + rate * 0.2
        return None


alert_rate = AlertRate()


def take_candidates(limit: int) -> list[dict]:
    """Hand over the oddest events, worst first, and clear the queue."""
    global _candidates
    ranked = sorted(_candidates, key=lambda c: -len(c["anomalies"]))[:limit]
    _candidates = []
    return ranked


def candidate_count() -> int:
    return len(_candidates)


# ══════════════════════════════════════════════════════════════════════
#  ENTITY GRAPH
# ══════════════════════════════════════════════════════════════════════

class Graph:
    """Who touched what, when.

    The hub problem is the reason this class is more than a wrapper: the
    domain controller authenticates all 25 users, so without suppression
    every user sits two hops from every other and the entire environment
    collapses into one incident.
    """

    # Shared infrastructure everyone touches. If these are usable as
    # bridges, every user is two hops from every other user and the whole
    # environment collapses into a single incident. Seeded from the start
    # rather than discovered after 400 events.
    STATIC_HUBS = {"host:DC-01", "host:FILESERVER-01", "host:MAIL-RELAY"}

    def __init__(self) -> None:
        # Evidence. One edge per event, because "which event connected these
        # two" is a question the incident graph view has to answer.
        self.g = nx.MultiDiGraph()
        # Topology. One edge per *relationship*, carrying the strongest link
        # seen and how many times it occurred.
        #
        # These are separate for a measured reason. `related()` used to walk
        # the multigraph, and `to_undirected()` copies it on every call —
        # 9ms at 2,000 edges, 180ms at 40,000. Since the multigraph gains an
        # edge per event and never prunes, correlation got steadily slower
        # for the whole run: a demo that is comfortable at 2,000 events
        # would have been unusable at the 30,000 the pitch talks about.
        #
        # The topology graph stops growing once the environment is known —
        # 75 nodes here settle at a few hundred edges no matter how long it
        # runs — so path finding stays flat.
        self.t = nx.Graph()
        self.hubs: set[str] = set(self.STATIC_HUBS)
        self._since_recompute = 0

    def clear(self) -> None:
        self.g.clear()
        self.t.clear()
        self.hubs = set(self.STATIC_HUBS)

    def add_event(self, ev: dict) -> list[dict]:
        deltas = []
        for a, rel, b in self._edges(ev):
            if a not in self.g:
                self.g.add_node(a, type=_kind(a), first_seen=ev["ts"])
                deltas.append({"op": "node", "id": a, "type": _kind(a)})
            if b not in self.g:
                self.g.add_node(b, type=_kind(b), first_seen=ev["ts"])
                deltas.append({"op": "node", "id": b, "type": _kind(b)})
            weight = config.EDGE_WEIGHT.get(rel, 2.0)
            self.g.add_edge(a, b, key=ev.get("event_id"), rel=rel,
                            ts=ev["ts"], weight=weight)

            # Keep the strongest relationship between the pair, not the
            # latest. Two machines that once exchanged a DNS query and now
            # share logins are close, and should stay close.
            prev = self.t.get_edge_data(a, b)
            if prev is None:
                self.t.add_edge(a, b, weight=weight, rel=rel, count=1)
            else:
                prev["count"] += 1
                if weight < prev["weight"]:
                    prev["weight"], prev["rel"] = weight, rel
            deltas.append({"op": "edge", "source": a, "target": b,
                           "label": rel.replace("_", " "),
                           "event_id": ev.get("event_id"),
                           "ts": ev["ts"].isoformat()})

        self._since_recompute += 1
        if self._since_recompute >= 400:
            self._recompute_hubs()
            self._since_recompute = 0
        return deltas

    def _edges(self, ev: dict):
        u = f"user:{ev['actor_user']}" if ev.get("actor_user") else None
        h = f"host:{ev['src_host']}" if ev.get("src_host") else None
        d = f"host:{ev['dst_host']}" if ev.get("dst_host") else None
        ip = f"ip:{ev['dst_ip']}" if ev.get("dst_ip") else None
        p = f"proc:{ev['process']}" if ev.get("process") else None
        pp = f"proc:{ev['parent_process']}" if ev.get("parent_process") else None

        if u and h:
            yield u, "logged_into", h
        if pp and p:
            yield pp, "spawned", p
        if h and p:
            yield h, "executed", p
        if h and ip:
            yield h, "connected_to", ip
        if h and d:
            yield h, "connected_to", d
        if u and d:
            yield u, "logged_into", d
        if ev.get("class_name") == "email_activity" and u:
            yield "host:MAIL-RELAY", "sent_email", u

    def _recompute_hubs(self) -> None:
        """A hub is something that connects to many *distinct* things.

        Measured on the topology graph, not the evidence graph. Degree on
        the evidence graph counts events, which makes a chatty workstation
        look like shared infrastructure — it isn't, it is just noisy. What
        makes the domain controller a hub is that twenty-five different
        accounts authenticate to it, and that is exactly what topology
        degree counts.
        """
        if self.t.number_of_nodes() < 20:
            return
        degrees = dict(self.t.degree())
        values = sorted(degrees.values())
        idx = min(int(len(values) * config.HUB_PERCENTILE / 100), len(values) - 1)
        cut = values[idx]
        self.hubs = set(self.STATIC_HUBS) | {
            n for n, d in degrees.items() if d >= max(cut, 12)}

    def related(self, a: str, b: str) -> bool:
        """Weighted cost, with hubs and process names removed as bridges.

        Runs on the topology graph, which is already undirected and already
        deduplicated, so there is no per-call copy. `subgraph` returns a
        view rather than a copy.

        **Process names cannot bridge, and that is the important line in
        this method.** `_edges()` yields `host --executed--> proc:<name>`,
        so two machines that both run chrome.exe sit two hops apart at
        weight 1.0 each — inside a budget of 3.0. Measured before this was
        added, WORKSTATION-04 was "related" to all eleven other
        workstations, which dragged eleven uninvolved people into the
        flagship incident and made the containment plan target the wrong
        host. With `proc:` barred it reaches exactly one: its genuine
        buddy-host relationship, which is what the graph is for.

        Suppressing shared *hosts* via STATIC_HUBS was the earlier version
        of this fix. It was correct and incomplete — shared *process names*
        are far more connected than any file server.
        """
        if a == b:
            return True
        if a not in self.t or b not in self.t:
            return False

        blocked = (self.hubs | {n for n in self.t.nodes
                                if n.startswith("proc:")}) - {a, b}
        sub = (self.t.subgraph([n for n in self.t.nodes if n not in blocked])
               if blocked else self.t)
        try:
            cost = nx.shortest_path_length(sub, a, b, weight="weight",
                                           method="dijkstra")
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return False
        return cost <= config.CLUSTER_HOP_BUDGET

    def subgraph_payload(self, entities: list[str]) -> dict:
        """Cytoscape elements for one incident."""
        nodes, edges, seen = [], [], set()
        wanted = set(entities)
        for a, b, data in self.g.edges(data=True):
            if a in wanted or b in wanted:
                for n in (a, b):
                    if n not in seen:
                        seen.add(n)
                        nodes.append({"data": {
                            "id": n, "label": n.split(":", 1)[-1],
                            "type": self.g.nodes[n].get("type", "unknown"),
                        }})
                edges.append({"data": {
                    "id": f"{a}->{b}-{data.get('ts')}",
                    "source": a, "target": b,
                    "label": data.get("rel", "").replace("_", " "),
                    "ts": data["ts"].isoformat() if data.get("ts") else None,
                    "event_id": data.get("event_id"),
                }})
        return {"elements": {"nodes": nodes, "edges": edges}}


def _kind(node_id: str) -> str:
    return node_id.split(":", 1)[0]


def rebuild_from_events(s: Session, run_id: str | None = None,
                        limit: int = 20_000) -> int:
    """Repopulate the in-memory graph from the events table.

    The graph, the anomaly baseline and the alert-rate window are all
    module-level state with no table behind them. That is fine until
    something restarts — and `uvicorn --reload` restarts on every file save,
    so an accidental edit during a rehearsal empties the attack graph while
    the incident card still reads 100.

    Every edge `_edges()` produces comes from a single event row, so the
    graph is fully reconstructible. Called on startup and by the graph
    endpoint when it finds itself cold.
    """
    q = s.query(Event).order_by(Event.ts)
    if run_id:
        q = q.filter(Event.run_id == run_id)
    rows = q.limit(limit).all()
    if not rows:
        return 0

    graph.clear()
    baseline.clear()
    for e in rows:
        ev = {"event_id": e.event_id, "ts": e.ts, "actor_user": e.actor_user,
              "src_host": e.src_host, "dst_host": e.dst_host,
              "dst_ip": e.dst_ip, "process": e.process,
              "parent_process": e.parent_process,
              "class_name": e.class_name, "outcome": e.outcome,
              "untrusted": e.untrusted or {}}
        graph.add_event(ev)
        baseline.observe(ev)

    log.info("rebuilt graph from %d stored events: %d nodes, %d edges",
             len(rows), graph.g.number_of_nodes(), graph.g.number_of_edges())
    return len(rows)


graph = Graph()


# ══════════════════════════════════════════════════════════════════════
#  SCORING
# ══════════════════════════════════════════════════════════════════════

def stages_from_tactics(tactics: list[str]) -> list[bool]:
    """Seven canonical stages. Defined once so no two screens disagree."""
    seen = set(tactics)
    return [any(t in seen for t in group)
            for _, group in config.CANONICAL_STAGES]


def score_incident(s: Session, inc: Incident) -> None:
    alerts = s.query(Alert).filter(Alert.incident_id == inc.incident_id).all()
    tactics = sorted({a.tactic for a in alerts if a.tactic})
    techniques = {a.technique for a in alerts if a.technique}

    stages = stages_from_tactics(tactics)
    breadth = sum(stages)

    base = config.KILLCHAIN_CURVE.get(breadth, 95)
    if techniques & config.CRITICAL_ALONE:
        base = max(base, config.CRITICAL_FLOOR)   # short chains can be critical

    from app.models import Host, OrgUser
    crit = 1.0
    priv = 1.0
    for e in inc.entity_ids:
        if e in graph.hubs:          # everyone touches these; they say nothing
            continue
        kind, _, name = e.partition(":")
        if kind == "host":
            h = s.get(Host, name)
            crit = max(crit, h.criticality if h else 1.0)
        elif kind == "user":
            u = s.get(OrgUser, name)
            priv = max(priv, u.privilege if u else 1.0)

    span_min = max((inc.last_seen - inc.first_seen).total_seconds() / 60, 1)
    worst = max((_rank(a.severity) for a in alerts), default=1)

    # Velocity and confidence used to be two functions of the same number —
    # how many alerts there are — which meant a busy hour got counted twice
    # and multiplied. Twenty-five unremarkable alerts across an ordinary
    # working day scored 98.
    #
    # Velocity now needs something serious behind it. Fast and severe is
    # alarming; fast and trivial is a Tuesday.
    velocity = min(len(alerts) / span_min * 4, 2.0)
    if worst < SEV_RANK["high"]:
        velocity = min(velocity, 1.0)

    # And confidence counts *corroboration* — distinct rules and distinct
    # telemetry sources agreeing — rather than volume. Ten firings of one
    # noisy rule is one opinion repeated, not ten opinions.
    distinct_rules = len({a.rule_id for a in alerts})
    confidence = min(0.55 + 0.09 * distinct_rules, 0.98)

    raw = base * min(crit, 2.0) * min(priv, 2.0) * max(velocity, 0.8) * confidence
    inc.base_score = round(min(raw, 100.0), 1)
    inc.risk_factors = {
        "killchain_breadth": breadth,
        "asset_criticality": round(crit, 2),
        "identity_privilege": round(priv, 2),
        "velocity": round(velocity, 2),
        "confidence": round(confidence, 2),
    }
    inc.tactics = tactics
    inc.stages = stages

    # Path A is now complete. Handing off to reconciliation, which is the
    # single place a final score is set — it folds in the model's contextual
    # adjustment, compares against the model's own blind verdict if there is
    # one, and acts on whichever of the two is more worried.
    #
    # With no model verdict it falls through to the deterministic number
    # unchanged, which is the case the AI-disabled demo runs.
    from app.services import assist
    assist.reconcile(s, inc)


def apply_score_delta(inc: Incident, techniques: set[str] | None = None) -> float:
    """base + delta, clamped. The only function that writes `risk_score`.

    Three limits, all of them here rather than in a prompt:

      * the delta is clamped to ±(AI_SCORE_MAX_UP, AI_SCORE_MAX_DOWN)
      * a critical technique holds the floor no matter what was argued
      * the result stays inside 0-100

    If the model never ran, `ai_score_delta` is zero and this returns the
    deterministic score unchanged. That is the case the demo runs with the
    AI switched off, and the verdict has to be identical.
    """
    if techniques is None:
        techniques = set()
    delta = float(inc.ai_score_delta or 0.0)
    delta = max(-config.AI_SCORE_MAX_DOWN, min(config.AI_SCORE_MAX_UP, delta))
    score = (inc.base_score or 0.0) + delta

    if config.AI_SCORE_RESPECTS_CRITICAL_FLOOR and \
            techniques & config.CRITICAL_ALONE:
        score = max(score, config.CRITICAL_FLOOR)

    return round(max(0.0, min(score, 100.0)), 1)


def _band(score: float, breadth: int) -> tuple[str, str]:
    """A number an analyst can act on needs a sentence beside it."""
    driver = (f"{breadth} of 7 attack stages observed"
              if breadth > 1 else "a single attack stage so far")
    if score >= 80:
        return ("High Confidence",
                f"Strongly supported by {driver} and a clear progression.")
    if score >= 45:
        return ("Review Recommended",
                f"Supported by {driver}, but worth a human check before acting.")
    return ("Low — Verify Manually",
            f"Based on {driver} — the signals are weak or new.")


# ══════════════════════════════════════════════════════════════════════
#  INGEST — the entry point the demo calls
# ══════════════════════════════════════════════════════════════════════

@dataclass
class BatchResult:
    alerts: list[dict] = field(default_factory=list)
    incident_id: str | None = None
    risk: float = 0.0
    injections: int = 0
    anomalies: int = 0          # odd, but no rule had an opinion
    flood: dict | None = None   # somebody may be burying the signal
    graph_delta: dict | None = None


def process_batch(raw_events: list[dict]) -> BatchResult:
    out = BatchResult()
    deltas: list[dict] = []
    injection_events: set[str] = set()

    with get_session() as s:
        for ev in raw_events:
            ev.setdefault("raw_hash", _hash(ev))
            s.add(Event(
                event_id=ev["event_id"], ts=ev["ts"], source=ev["source"],
                class_name=ev["class_name"], actor_user=ev.get("actor_user"),
                src_host=ev.get("src_host"), dst_host=ev.get("dst_host"),
                src_ip=ev.get("src_ip"), dst_ip=ev.get("dst_ip"),
                process=ev.get("process"), parent_process=ev.get("parent_process"),
                file_hash=ev.get("file_hash"), domain=ev.get("domain"),
                outcome=ev.get("outcome"), untrusted=ev.get("untrusted") or {},
                raw_ref=ev.get("raw_ref", "generated"), raw_hash=ev["raw_hash"],
                synthetic=True, run_id=ev.get("run_id"),
                truth_technique=ev.get("truth_technique"),
            ))
            deltas.extend(graph.add_event(ev))

            # ── the injection check sits here, before anything is summarised ──
            from app.services import sanitise
            for item in sanitise.process(ev["event_id"], ev.get("untrusted") or {}):
                if item.finding:
                    out.injections += 1
                    injection_events.add(ev["event_id"])
                    alert = _make_alert(
                        s, ev, item.finding.as_alert_payload()["rule_id"],
                        item.finding.as_alert_payload()["rule_title"],
                        "high", "T1565", "TA0040", origin="injection")
                    out.alerts.append(alert)

            hits = evaluate(ev)
            for rule in hits:
                out.alerts.append(_make_alert(
                    s, ev, rule.rule_id, rule.title, rule.severity,
                    rule.technique, rule.tactic))

            # ── what the rules did NOT catch ──────────────────────────────
            # Measure every event against the baseline, then queue the odd
            # ones that fired nothing. A rule already having an opinion
            # means the model has nothing to add.
            odd = baseline.oddities(ev)
            baseline.observe(ev)
            if not hits and len(odd) >= config.TRIAGE_MIN_ODDITY:
                out.anomalies += 1
                if len(_candidates) < config.TRIAGE_CANDIDATES_MAX * 3:
                    _candidates.append({
                        "event_id": ev["event_id"],
                        "ts": ev["ts"],
                        "user": ev.get("actor_user"),
                        "host": ev.get("src_host"),
                        "dst_host": ev.get("dst_host"),
                        "dst_ip": ev.get("dst_ip"),
                        "process": ev.get("process"),
                        "parent_process": ev.get("parent_process"),
                        "class_name": ev.get("class_name"),
                        "outcome": ev.get("outcome"),
                        "untrusted": ev.get("untrusted") or {},
                        "anomalies": odd,
                    })

        s.flush()

        # ── correlate anything new into incidents ──
        touched: dict[str, Incident] = {}
        for a in out.alerts:
            inc = _assign(s, a)
            if inc:
                touched[inc.incident_id] = inc
        s.flush()                  # the links must exist before we score
        for inc in touched.values():
            score_incident(s, inc)
            if injection_events:
                linked = {e for a in s.query(Alert)
                                .filter(Alert.incident_id == inc.incident_id)
                          for e in (a.event_ids or [])}
                if linked & injection_events:
                    inc.injection_detected = True
        if touched:
            best = max(touched.values(), key=lambda i: i.risk_score)
            out.incident_id, out.risk = best.incident_id, best.risk_score


    if out.alerts and raw_events:
        out.flood = alert_rate.observe(len(out.alerts), raw_events[-1]["ts"])
        if out.flood:
            log.warning("alert flood: %s", out.flood["message"])

    if deltas:
        out.graph_delta = {"deltas": deltas[:120]}
    return out


def _make_alert(s: Session, ev: dict, rule_id: str, title: str,
                severity: str, technique: str, tactic: str,
                origin: str = "rule", ai_confidence: float | None = None,
                ai_reason: str | None = None,
                anomalies: list[str] | None = None) -> dict:
    entities = [f"user:{ev['actor_user']}"] if ev.get("actor_user") else []
    if ev.get("src_host"):
        entities.append(f"host:{ev['src_host']}")
    if ev.get("dst_host"):
        entities.append(f"host:{ev['dst_host']}")

    alert = Alert(
        alert_id=f"alr_{str(ULID()).lower()}",
        event_ids=[ev["event_id"]], rule_id=rule_id, rule_title=title,
        severity=severity, technique=technique, tactic=tactic,
        entities=entities, detected_at=ev["ts"], run_id=ev.get("run_id"),
        origin=origin, ai_confidence=ai_confidence, ai_reason=ai_reason,
        anomalies=anomalies or [],
    )
    s.add(alert)

    rule_row = s.get(Rule, rule_id)
    if rule_row:
        rule_row.fired_count += 1

    return {"alert_id": alert.alert_id, "rule_id": rule_id, "title": title,
            "severity": severity, "technique": technique,
            "entities": entities, "ts": ev["ts"].isoformat(),
            "origin": origin, "ai_confidence": ai_confidence,
            "ai_reason": ai_reason}


def _assign(s: Session, alert_dict: dict) -> Incident | None:
    """Join an existing incident if related, otherwise start one."""
    alert = s.get(Alert, alert_dict["alert_id"])
    if not alert:
        return None

    window = alert.detected_at - timedelta(minutes=config.CLUSTER_WINDOW_MIN)
    candidates = (s.query(Incident)
                   .filter(Incident.status == "open",
                           Incident.last_seen >= window)
                   .order_by(Incident.last_seen.desc()).limit(12).all())

    # Shared infrastructure is not evidence of a relationship.
    a_ents = [e for e in alert.entities if e not in graph.hubs] or alert.entities
    for inc in candidates:
        i_ents = [e for e in inc.entity_ids if e not in graph.hubs] or inc.entity_ids
        if any(graph.related(e1, e2) for e1 in a_ents for e2 in i_ents):
            alert.incident_id = inc.incident_id
            inc.entity_ids = sorted(set(inc.entity_ids) | set(alert.entities))
            _retitle(s, inc, alert)
            inc.last_seen = max(inc.last_seen, alert.detected_at)
            return inc

    inc = Incident(
        incident_id=f"inc_{str(ULID()).lower()}",
        title=_title(alert),
        entity_ids=alert.entities,
        first_seen=alert.detected_at, last_seen=alert.detected_at,
        tactics=[alert.tactic] if alert.tactic else [],
        run_id=alert.run_id, status="open",
    )
    s.add(inc)
    s.flush()
    alert.incident_id = inc.incident_id
    return inc


SEV_RANK = {"informational": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}


def _rank(sev: str | None) -> int:
    return SEV_RANK.get(sev or "low", 1)


STAGE_ORDER = {tactic: n for n, (_, group)
               in enumerate(config.CANONICAL_STAGES) for tactic in group}


def _title_rank(a: Alert) -> tuple[int, int]:
    """Severity first, then how far through the kill chain.

    The tie-break matters. A ransomware incident usually contains several
    critical alerts — credential theft, shadow-copy deletion, encryption —
    and naming it after whichever fired first gives you "Credential material
    read from process memory" on a card whose risk score is 100 because the
    files are already encrypted. Name it after how far the attacker got.
    """
    return (_rank(a.severity), STAGE_ORDER.get(a.tactic or "", 0))


def _retitle(s: Session, inc: Incident, joining: Alert) -> None:
    """An incident is named after the worst thing in it.

    This used to cache the current severity on the object as `inc._sev`,
    which is not a column — so it vanished the moment the session ended and
    the next batch started again from "low". The visible symptom was an
    incident scoring 100 for ransomware while its card read "Domain account
    enumeration", because a medium alert arriving later had claimed the
    title. Query the alerts instead; they are the record.
    """
    current = max(
        (a for a in s.query(Alert).filter(Alert.incident_id == inc.incident_id)),
        key=_title_rank, default=None)

    if current is None or _title_rank(joining) > _title_rank(current):
        inc.title = _title(joining)


def _title(alert: Alert) -> str:
    host = next((e.split(":")[-1] for e in alert.entities
                 if e.startswith("host:") and e not in graph.hubs), None)
    if not host:
        host = next((e.split(":")[-1] for e in alert.entities
                     if e.startswith("host:")), "unknown host")
    return f"{alert.rule_title} on {host}"


def admit_ai_alerts(accepted: list[dict]) -> dict:
    """Take validated AI triage findings and put them through the SAME path
    a rule-fired alert takes: alert row, entity graph, clustering, scoring.

    Deliberately identical. An AI-raised alert gets no shortcut and no
    special weight — it is marked `origin="ai_triage"`, capped at the
    severity policy allows, and then it competes on the same terms.
    """
    if not accepted:
        return {"admitted": 0, "incidents": []}

    made, touched = [], {}
    with get_session() as s:
        for item in accepted:
            ev = item["event"]
            technique = item["technique"]
            _, tactic = config.TECHNIQUE_CATALOGUE[technique]
            made.append(_make_alert(
                s, {"event_id": ev["event_id"], "ts": ev["ts"],
                    "actor_user": ev.get("user"), "src_host": ev.get("host"),
                    "dst_host": ev.get("dst_host"),
                    "run_id": item.get("run_id")},
                rule_id="AI_TRIAGE",
                title=item["title"],
                severity=item["severity"],
                technique=technique, tactic=tactic,
                origin="ai_triage",
                ai_confidence=item["confidence"],
                ai_reason=item["reason"],
                anomalies=ev.get("anomalies", [])))
        s.flush()

        for a in made:
            inc = _assign(s, a)
            if inc:
                touched[inc.incident_id] = inc
        s.flush()
        for inc in touched.values():
            score_incident(s, inc)

        return {"admitted": len(made),
                "alerts": made,
                "incidents": [{"incident_id": i.incident_id,
                               "title": i.title,
                               "risk_score": i.risk_score}
                              for i in touched.values()]}


def primary_entities(entity_ids: list[str]) -> list[str]:
    """Shared infrastructure last — it appears in everything and therefore
    identifies nothing."""
    own = [e for e in entity_ids if e not in graph.hubs]
    return own + [e for e in entity_ids if e in graph.hubs]


def _hash(ev: dict) -> str:
    payload = {k: (v.isoformat() if isinstance(v, datetime) else v)
               for k, v in ev.items() if k != "raw_hash"}
    return "sha256:" + hashlib.sha256(
        json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()[:32]
