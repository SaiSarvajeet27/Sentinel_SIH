# Feature Coverage

Every element from the screenshots, mapped to the endpoint behind it.

---

## Recommendation Detail screen

| UI element | Endpoint | State |
|---|---|---|
| Severity chip (CRITICAL) | `GET /api/incidents/{id}` → `severity` | ✅ |
| Category chip (SECURITY) | → `category` — derived from technique | ✅ new |
| ID (REC-001) | → `incident_id` | ✅ |
| Title, target summary | → `title`, `entities` | ✅ |
| Confidence driver sentence | → `confidence_driver` | ✅ |
| **High Confidence** badge | → `confidence_band` — a band, never a percentage | ✅ |
| **Approve** | `POST /api/actions/{id}/approve` | ✅ |
| **Override** | `POST /api/actions/{id}/override` | ✅ |
| **Escalate** | `POST /api/actions/{id}/escalate` | ✅ |
| **Dismiss** | `POST /api/actions/{id}/dismiss` | ✅ new |
| Autonomy switcher in the header | `PUT /api/settings/autonomy` | ✅ |
| **Why This?** tab | `GET /api/incidents/{id}/explanation` → `why_this` | ✅ new |
| **Evidence** tab | → `evidence` | ✅ new |
| **Limitations** tab | → `limitations` | ✅ new |
| **Alternatives** tab | `GET /api/incidents/{id}/alternatives` | ✅ |
| **Agent Pipeline** tab | `GET /api/incidents/{id}/agent-pipeline` | ✅ new |
| **Trust Time Machine** tab | `GET /api/incidents/{id}/trust-time-machine` | ✅ new |
| Numbered reasoning steps | → `why_this` — plain language, each cites an event | ✅ new |

### Multi-Agent Transparency Pipeline

Detection → Analysis → Remediation, with a timestamped trail.

**One thing to be careful about, because it is easy to overclaim.** These are
the named stages of a deterministic pipeline, not autonomous language-model
agents. Detection is Sigma rules, Analysis is graph correlation and scoring,
Remediation is playbook matching. Every step carries an `engine` field saying
what actually produced it, and `ai_assisted` marks the one or two steps where
a model contributed wording.

A verified run produced **18 steps, 0 AI-assisted** with the model disabled —
which is the honest version of the claim, and a better one.

---

## Device Explorer

| UI element | Endpoint | State |
|---|---|---|
| Fleet devices table | `GET /api/devices` | ✅ new |
| Device ID · Model · Owner · Department | → each row | ✅ new |
| Risk Score | → `risk_score`, **derived** — open incidents, alert severity, patch age, coverage gaps | ✅ new |
| Health chip (CRITICAL / AT RISK / HEALTHY) | → `health` | ✅ new |
| Search by ID, Model, Owner | `?search=` | ✅ new |
| All Departments filter | `?department=` | ✅ new |
| All Health Statuses filter | `?health=` | ✅ new |
| Device detail | `GET /api/devices/{id}` | ✅ new |
| Department analytics | `GET /api/devices/analytics` | ✅ new |

The risk score explains itself — every device returns a `reasons` list, so
*"risk 80"* is accompanied by *"involved in 1 open incident, 47 days behind on
security updates, no email visibility."*

**Shared infrastructure is weighted down.** Without that the domain controller
is permanently critical, because it appears in every incident and therefore
identifies nothing.

---

## Activity Log & Audit Trail

| UI element | Endpoint | State |
|---|---|---|
| TOTAL · APPROVAL RATE · APPROVED · ESCALATED · OVERRIDDEN | `GET /api/activity` → `stats` | ✅ new |
| Search actions, notes | `?search=` | ✅ new |
| Category filters | `?category=` | ✅ new |
| Decision filters | `?decision=` | ✅ new |
| Timeline entries with notes and status | → `items` | ✅ new |
| Signed, tamper-evident | every row `signed: true`; `POST /api/ledger/verify` | ✅ |

---

## Sentinel SOC dashboard

| UI element | Endpoint | State |
|---|---|---|
| 7-step demo bar | `GET /api/demo/state`, `/next`, `/play`, `/reset` | ✅ |
| KPI cards + deltas + sparklines | `GET /api/dashboard` → `kpis`, `deltas` | ✅ |
| Threat Activity chart | → `threat_activity` | ✅ |
| Top Threat Types donut | → `threat_types` | ✅ |
| Recent Incidents table | `GET /api/incidents` | ✅ |
| Recent Playbooks with usage | → `playbooks` | ✅ |
| Live Activity Feed | WebSocket `/ws` | ✅ |
| Security Operations Summary | → `ops_summary` (MTTD, MTTR, containment) | ✅ |
| Active Threat Map | → `threat_map` | ✅ |
| System Health % | `GET /api/health` — a real check | ✅ |
| Notification bell | `GET /api/notifications` | ✅ |
| Ctrl+K palette | `GET /api/search` | ✅ |

---

# How the AI is used, and how it fits in a free tier

## Six tasks, one call

The interface needs reasoning steps, evidence, limitations, what-would-change,
both sides of the argument, and a rationale. Asking for those separately is
**six requests per incident** — roughly forty per demo run, which does not fit
inside Groq's free tier, and a second rehearsal would hit the per-minute limit.

`explain.build_explanation()` asks for all six in **one structured call**.
Eight requests become one, and the model produces a more coherent set because
it sees the whole incident at once.

## Caching by content hash

The same scenario re-run costs nothing. That matters because you will rehearse
the demo many times.

```
GET /api/ai/usage
→ { "providers": { "groq": {"minute": 25, "day": 850, "tokens_minute": 10000} },
    "cache": { "entries": 12, "hits": 31, "misses": 6, "hit_rate": 0.838 } }
```

## Budget enforcement

`app/llm/quota.py` holds limits **below** the published ceilings — 25/min and
850/day against Groq's 30 and 1,000 — so a burst near the end of a demo cannot
tip you over. When a budget is exhausted the router falls back to another
provider, then to Ollama, then to a deterministic template. **A failure returns
`ok=False`; it never raises.**

## Where each provider is used

| Task | Provider | Why |
|---|---|---|
| Scenario generation | **Gemini** | Creative, varied output. Native JSON schema. And it processes no real telemetry — the scenario is fiction we are inventing |
| The batched explanation | **Groq** | 700+ tokens/sec, so the narrative appears while the analyst is still reading the graph |
| Anomaly triage | **Groq** | One call over up to 40 events; latency matters because the queue keeps filling |
| Campaign linking | **Groq** | One call over the open incidents |
| Score adjustment | **Groq** | Short call, tight output |
| Remediation plan | **Groq** | The analyst is waiting on this one |
| Detection rules, graph clustering, tiers, approvals, the ledger | *(none)* | Deterministic, and they run before any model does |

## Estimated spend for a full demo run

| | Calls |
|---|---|
| Scenario generation | 1 (Gemini) |
| Anomaly triage | 2–4 (Groq) — hard-capped at `TRIAGE_CALLS_PER_RUN` |
| Campaign linking | 1 (Groq) |
| Score adjustment | 1–2 (Groq) |
| Explanation, batched | 1–3 (Groq) |
| Remediation plan | 1 (Groq) |
| **Total** | **7–12 per run** |

At 850 Groq requests a day that is **roughly 80 full demo runs**, and a
repeated scenario is served entirely from cache. The triage cap is the
reason this is bounded: without it a long run would call the model once per
batch and drift.

---

# Verified

A complete run on SQLite with the model disabled and no API keys:

```
2,185 events  ->  4 open incidents

  100.0 | 5/7 stages | Mass file encryption behaviour on WORKSTATION-04  ⚠injection

  EXPLANATION      status=ai_disabled · 3 reasoning steps · 4 evidence items
  AGENT PIPELINE   18 steps, 0 AI-assisted
  TRUST TIME MACHINE  8 similar incidents · 5 confirmed threats
  DEVICES          15 devices · 4 critical · 5 at risk · 6 healthy
  ACTIONS          tier 0/1 executed · tier 2 suspend_account held for a human
  LEDGER           valid=True
```

**Every tab populated with the AI switched off.** The explanation fell back to
a deterministic template and labelled itself `ai_disabled`; everything else —
detection, correlation, scoring, the agent trail, the precedent, the device
risk, the approval gate — ran unchanged.

That is the whole architectural claim, demonstrated rather than asserted.

---

# The AI writes the fix

`POST /api/incidents/{id}/remediation`

The model reads the incident and the environment and writes the plan — which
steps, in what order, and why each one follows from what was detected. It also
returns what it **considered and rejected**, so the analyst is reviewing a
recommendation rather than approving a list.

That is real authorship. Two similar incidents can get different plans if the
circumstances differ — a machine belonging to someone mid-deadline gets a
narrower recommendation than an idle one.

## Three things stay outside the model's reach

| | Decided by |
|---|---|
| Which actions exist at all | A fixed vocabulary of 12. An invented action is discarded |
| The **risk tier** | Policy, in `config.TIERS`. The model is explicitly told not to state risk |
| The **blast radius** | Computed from the entity graph, never written |

So the fix is the AI's. Whether that fix runs by itself, or waits for a named
human, is not — and cannot become — the AI's to answer.

## Verified

```
CONSTRAINT TEST — model proposed 3 actions, 2 of them invented:
  proposed  : delete_all_backups · isolate_host · grant_admin
  accepted  : isolate_host
  discarded : 2
```

```
REMEDIATION PLAN  source=playbook (ai_disabled)

  Collect forensic snapshot   tier 0  ✓ executed
     who it affects: No user-visible impact
  Force re-authentication     tier 1  ✓ executed
     who it affects: 1 account · 2 active sessions · Library Officer
  Revoke active sessions      tier 1  ✓ executed
  Suspend account             tier 2  → NEEDS APPROVAL
     who it affects: 1 account · 2 active sessions · Library Officer

  auto-executed 3 · awaiting a human 1
```

With the model switched off the plan still arrives — a deterministic playbook
match, labelled `source=playbook` so the interface can say the recommendation
was not written by the AI. **The gate behaves identically either way.**

## Confidence bands

Matched to the cards exactly: **High Confidence** · **Review Recommended** ·
**Low — Verify Manually**. Each carries a driver sentence, never a percentage.

---

# The AI assists detection, chain detection and scoring

Writing the fix was the model's first piece of real analytical work. It now
does three more, in the stages that decide what the analyst ever sees.

The reason that is still safe is one sentence: **everywhere the model could
make the system miss something it is bounded hard, and everywhere it could
make the system notice something it is given room.**

## Detection — reviewing what the rules missed

`POST /api/assist/triage` · `GET /api/assist/candidates`

Rules catch what somebody already thought to write down. A deterministic
anomaly baseline — counting, not judgement — measures every event against
what normal looks like here: how often that process runs, whether that
parent has ever started that child, whether that account has reached that
host before, whether anyone has ever contacted that address.

Events that are unusual **and** that no rule matched go into a queue. That
queue is the only thing the model ever sees.

```
GET /api/assist/candidates
→ { "waiting": 26, "min_oddities": 2, "batch_size": 40 }
```

| | Decided by |
|---|---|
| Which events are worth reviewing | The anomaly baseline. Deterministic, and it runs whether or not the AI is on |
| Which techniques may be named | A catalogue of 14. An invented one is discarded |
| The severity of anything it raises | Capped at **medium** by policy *and* by a database constraint. Only a written rule may call something critical, because only a rule can be reviewed before it fires |
| Whether an alert can be suppressed | **It cannot.** There is no field for "this is benign". The model can raise suspicion. It has no way to lower it |

This also answers the fair question about the numbers. Out of ~2,200 events,
rules explain the ones that became an incident. The baseline surfaces the
twenty or thirty in between — odd enough to look at, not odd enough for
anyone to have written a rule — and the model's job on that list is mostly
to stay silent.

```
reviewed 22 unusual events no rule matched  →  raised 1, stayed silent on 21
```

The background generator now has a long tail on purpose — rare-but-innocent
software, a mistyped password, a new SaaS domain, someone borrowing a
colleague's machine. Without it the anomaly list would contain only the
answer, and the approach would look far better than it is.

## Chain detection — links the graph could not walk

`POST /api/assist/links` · `GET /api/assist/links` ·
`POST /api/assist/links/{id}/accept` · `/decline`

The entity graph connects incidents that share an entity inside a weighted
hop budget. It is blind to one case: an attacker who compromises one
account, harvests a second, and continues from a machine that shares no edge
with the first. There is nothing to walk. Two incidents.

A person reading both summaries would see one attack. So would a model.

Every proposal passes a **deterministic gate** before an analyst is shown it:

| Check | Rejects |
|---|---|
| `both_incidents_exist` | An id the model invented |
| `distinct` | Linking something to itself |
| `within_time_window` | More than 4 hours apart |
| `describes_a_progression` | Two incidents at the same stage — a coincidence, not a chain |
| `cited_entities_are_real` | Any entity it claimed connects them that does not appear in either |
| `not_already_linked` | Duplicates |
| `confidence_above_bar` | Below 0.6 |

**A link that passes the gate still does not merge anything.** It waits.

```
ANALYST ACCEPTS proposal 1
  …j4nxx5 merged into …9v61p1
  risk now 100.0, spanning 2 of 7 stages
  attributed to Simran Singh
```

Two isolated 30-point incidents became one 100-point incident — because a
named person agreed with the model, not because the model said so.

## Scoring — a bounded argument about the number

`POST /api/incidents/{id}/score-assist`

The arithmetic knows kill-chain breadth, asset criticality, identity
privilege, velocity and alert count. It does not know that the affected host
is the only one holding a backup, or that the account belongs to somebody on
leave who could not have logged in.

So the model argues, and gets a clamp:

| | |
|---|---|
| Range | **+15 / −10.** Asymmetric on purpose — a model that has been talked into "this is fine" can move a score down by ten points and no further |
| Critical floor | A technique in `CRITICAL_ALONE` holds the score at 75 regardless of what was argued |
| Unargued adjustments | Discarded. A number with no reason attached is not applied |
| Enforcement | `config.py`, `pipeline.apply_score_delta()`, **and** a `CHECK (ai_score_delta BETWEEN -10 AND 15)` in the schema |

`base_score` is stored beside `risk_score` on every incident and returned in
every list response, so **"what would this have been without the AI"** is
answerable per incident, on screen.

## One endpoint that answers the whole question

`GET /api/incidents/{id}/ai-contribution`

```
detection : 49 from rules, 1 from model review
scoring   : base 78, delta +0, final 78
without AI: 78 — verdict changes: False
```

## Verified

`python scripts/verify_assist.py` — no API key needed. The model is stubbed
to return the hostile payloads a compromised or confused one would produce,
because that is the only honest way to test a boundary.

```
1 · DETECTION
  the model returned 4 findings
    accepted : T1048 on evt_real_001 — severity medium (cap is medium)
    discarded: evt_DOES_NOT_EXIST — no such event in the batch
    discarded: evt_real_002       — technique 'T9999.INVENTED' not in catalogue
    discarded: evt_real_002       — confidence 0.21 is below the 0.55 bar

2 · CHAIN
  the model proposed 4 links
    PROPOSED : …j4nxx5 ↔ …9v61p1  confidence 0.82 — all 7 checks passed
    rejected : …27gvkw ↔ …ADE_UP  failed both_incidents_exist, within_time_window,
                                         describes_a_progression, cited_entities_are_real
    rejected : …27gvkw ↔ …j4nxx5  failed describes_a_progression, cited_entities_are_real
    rejected : …27gvkw ↔ …9v61p1  failed describes_a_progression, confidence_above_bar

3 · SCORING
  asked for +90   granted +15   clamped=True
  asked for -80   granted -10   clamped=True
  78 -10 = 68, but the final score is 75
  because ['T1003.001', 'T1486', 'T1490'] is present and the floor is 75
  asked for +12 with no argument attached   granted +0

4 · SAME SCENARIO, MODEL OFF THEN ON
  identical event stream : 2224 events both passes
  verdict off            : High Confidence at 100.0
  verdict on             : High Confidence at 100.0
  AI-raised alerts       : 0 → 1
```

**The model contributed findings. It did not change what the system
concluded.** That is the claim, and it is now a script rather than a slide.
