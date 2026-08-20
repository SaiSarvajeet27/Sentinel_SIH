# Sentinel SOC — analysis of the current version

Written after a full audit of the code as it stands, not from memory. Every
number here came from running it.

> **Update 2 — the 16 August independent audit is closed.**
> Every finding in it has been fixed and verified. The two that mattered
> most: process names were acting as graph bridges, so every workstation was
> "related" to every other and the containment plan proposed isolating the
> file server and suspending an uninvolved Library Officer; and four of the
> five database constraints the README claimed did not exist on the database
> the demo actually runs on. Both are now true. Details in §2.9.
>
> Current numbers: **7/7 kill-chain stages**, **13/13 planted techniques
> detected**, **0.52% false-positive rate**, containment targeting the right
> host and the right person, and 5 open incidents so campaign linking has
> something to link.
>
> **Update — dual-path analysis added since this was first written.**
> The model is no longer a reviewer of leftovers. It reads the same windows
> the rules read, blind to what they concluded, and produces its own
> verdict. The two are then reconciled rather than merged: we act on
> whichever is more worried, and a disagreement puts the incident in front
> of a person whatever either score says.
>
> Measured contribution is now **49% deterministic / 51% model** by distinct
> analytical conclusions, weighted equally across the four stages
> (`GET /api/assist/balance`). Sections 1 and 4 below have been updated;
> everything else still holds.
>
> Three further defects were found and fixed in the same pass — see §2.5.

---

## The short version

**What you have is stronger than it was this morning, and it was weaker than
it looked.** The audit found four real defects, three of which would have
been visible to a judge, and one of which — a 98-point critical incident
raised by a completely ordinary working day — would have been fatal if
someone had asked to see the system idle.

All four are fixed. What remains is a system whose central architectural
claim is now measurable rather than asserted, plus one feature you have
built and cannot currently demonstrate.

---

## 1 · What is actually there

| | |
|---|---|
| Python | **~8,500 lines** across 22 modules |
| Endpoints | **64 HTTP + 1 WebSocket** |
| Deterministic core | pipeline, respond, governance, sanitise, metrics, devices |
| AI-facing | assist, explain, remediate, scenario |
| Dead code | **none** — 590 lines removed |
| Detection rules | 11 Sigma-shaped, 4 protected from retirement |
| Model call sites | **8** — every one routed through `router.ask()` |
| Database enforcement rules | 5 constraints + 1 trigger |
| Measured contribution | **49% deterministic / 51% model** |

The ratio is worth knowing before someone asks, and the honest framing is
this: **contribution is roughly even, authority is not.** The model produces
about half the analytical conclusions and holds none of the decisions that
cannot be undone. Both halves of that sentence are measurable — the first
from `/api/assist/balance`, the second from `scripts/verify_assist.py`.

### The eight places a model is consulted

```
scenario.py     Gemini writes a fictional attack plan
assist.py       analysis  — reads a whole window, blind to the rules   ← path B
assist.py       assess    — its own verdict, blind to the arithmetic   ← path B
assist.py       triage    — reviews unusual events no rule matched
assist.py       correlate — proposes campaign links
assist.py       score     — argues for a bounded adjustment
explain.py      six explanation fields in one batched call
remediate.py    writes the remediation plan
```

Eight call sites, one router, one master switch. That is an unusually clean
answer to *"where exactly is the AI?"* and most teams cannot give it.

The two marked **path B** are the ones that make this a dual-path system
rather than an assisted one. Neither is shown what the deterministic side
concluded — `_render_evidence()` deliberately omits `risk_score`,
`base_score`, `confidence_band` and `risk_factors`, because a second opinion
that has already seen the first is not a second opinion.

---

## 2 · Four defects found, all fixed

### 2.1 A normal day scored 98 — the serious one

Feeding **1,855 events of pure background noise** and no attack at all
produced a single incident scoring **98.0**, banded *High Confidence*, built
from 25 alerts across 29 entities.

Three causes stacked:

**The `first_time_auth` rule fired 24 times in 45 minutes.** Every person
who sat at a colleague's desk, every account touching a file server for the
first time that week. A signal that fires on ordinary behaviour is not a
detection — it is an anomaly, and it was sitting in the rule set at *high*
severity.

**Velocity and confidence were two functions of the same number.** Both rose
with alert count, then multiplied:

```python
velocity   = min(len(alerts) / span_min * 4, 2.0)      # 25 alerts → 2.0
confidence = min(0.55 + 0.09 * len(alerts), 0.98)      # 25 alerts → 0.98
raw = base * crit * priv * velocity * confidence
```

A busy hour was counted twice and the product was squared.

**The noise generator gave every user a random peer machine.** That turns
the estate into a small-world graph where everything is two hops from
everything, and correlation merges the whole day.

**Fixed:**

- `first_time_auth` removed from the rule set and moved into
  `Baseline.oddities()`, where it is one signal among several and needs
  corroboration. The attack is still caught — what made the attacker's
  authentication interesting was never that it was the first one, it was
  that it followed credential theft
- Velocity now requires a high or critical alert behind it. Fast and severe
  is alarming; fast and trivial is a Tuesday
- Confidence counts **distinct rules** agreeing, not total firings. Ten
  firings of one noisy rule is one opinion repeated
- Each person borrows one fixed colleague's machine, which is what people
  actually do

**Result:**

```
A NORMAL DAY · 1,855 events, no attack
  incidents raised : 1     worst score: 15.4  (Low — Verify Manually)
  anomaly queue    : 57 events for the model to review

THE SAME DAY, WITH THE ATTACK
  100.0 | 5/7 stages | High Confidence | Shadow copies deleted — recovery inhibited
```

**15.4 against 100.0.** Put that slide in the deck. Almost nobody measures
what their detector does when nothing is happening, and the reason is that
most of them cannot survive the measurement.

### 2.2 Correlation got slower for the entire run

`graph.related()` walked the evidence multigraph, and `to_undirected()`
copies the whole thing on every call. The multigraph gains an edge per event
and never prunes:

| Evidence edges | `related()` |
|---|---|
| 2,256 | 13,898 µs |
| 8,742 | 47,134 µs |
| 17,604 | 92,428 µs |

Ingest throughput fell from 1,038 to 458 events/sec across a single run. A
demo comfortable at 2,000 events would have been unusable at the 30,000 the
pitch talks about.

**Fixed** by separating the two graphs that were doing one job:

- `graph.g` — evidence. One edge per event, because *"which event connected
  these two"* is a question the incident graph view has to answer
- `graph.t` — topology. One edge per relationship, carrying the strongest
  link and a count

`related()` runs on the topology graph, which stops growing once the
environment is known.

| | Before | After |
|---|---|---|
| `related()` at 17.6k events | 92,428 µs | **57 µs** |
| Ingest, late in a run | 458 ev/s | **1,093 ev/s** |
| Topology edges at 17.6k events | — | 516, flat |

Hub detection moved to the topology graph at the same time, which is also
more correct: a hub is something connected to many *distinct* things, and
degree on the evidence graph was counting events — making a chatty
workstation look like shared infrastructure.

### 2.3 Incident titles could be downgraded

`_assign()` cached the current severity as `inc._sev`, which is **not a
column**. It vanished when the session ended, so the next batch started
again from "low". Demonstrated:

```
1. after critical batch: Shadow copies deleted — recovery inhibited
2. after medium batch  : Domain account enumeration        ← overwritten
   alert severities    : ['critical', 'medium']
```

An incident scoring 100 for ransomware, with a card reading *"Domain account
enumeration"*. Exactly the kind of thing a judge notices on screen.

**Fixed:** the title is derived from the alerts on record, ranked by
severity and then by kill-chain depth. The tie-break matters — a ransomware
incident holds several critical alerts, and naming it after whichever fired
first gave you *"Credential material read from process memory"* on an
incident whose files were already encrypted.

### 2.4 Two endpoints would have thrown ImportError

`from app.services import ledger` appears three times. **There is no
`ledger.py`** — the function lives in `governance.py`. The affected paths:

- `POST /api/assist/links/{id}/accept`
- `POST /api/assist/links/{id}/decline`
- `demo.reset()`

Two of those are the campaign-link endpoints, which means the human-approval
step of the newest feature would have 500'd the first time anyone clicked
it. The imports are inside function bodies, so nothing failed at startup and
nothing failed in the test scripts.

**Fixed.**

---

### 2.5 Three more, found in the dual-path pass

**590 lines of dead code, now deleted.** `recommendations.py` (401) and
`agentpipeline.py` (189) were not imported anywhere and duplicated
`agents.py`. The hazard was never wasted space — it was somebody editing the
wrong file the night before submission.

**Three configured LLM tasks that did not exist.** `both_sides`, `rationale`
and `title` had provider settings in `TASK_PROVIDER` and no call sites; they
are fields inside the batched `explain` call. Config that advertises knobs
which are not connected to anything is worse than no config, because
somebody eventually sets one and wonders why nothing happened. Removed.

**`SECRET_KEY`, `CATEGORIES`, `SIM_NOISE_EVENTS`, `SIM_SPEED` unused.**
`SIM_HOSTS`/`SIM_USERS` were declared and then hardcoded at the call sites —
now wired. `SECRET_KEY` removed outright, because declaring one implies an
authentication property this build does not have. `FLOOD_MULTIPLIER` was the
interesting case: rather than delete it, alert-flood detection is now
implemented, since burying one real alert under four hundred harmless ones
is a technique that still works.

### 2.9 The independent audit's findings, all closed

An audit on 16 August found eight defects by reading the code and running
it. Every one is fixed. Worst first:

**Process names were bridging the entire estate.** `_edges()` yields
`host --executed--> proc:<name>`, so two machines that both ran Chrome sat
two hops apart inside a budget of 3.0. Measured: WORKSTATION-04 was
"related" to **all eleven** other workstations. Eleven uninvolved people
were dragged into the flagship incident, and because `_resolve()` took
`entity_ids[0]` from an alphabetically sorted list, the containment plan
proposed isolating **FILESERVER-01** and suspending **arjun**, a Library
Officer with no connection to the attack.

Suppressing shared *hosts* via `STATIC_HUBS` was the earlier version of this
fix. It was correct and incomplete — shared *process names* are far more
connected than any file server. Barring `proc:` nodes from path-finding
fixed both defects at once:

| | Before | After |
|---|---|---|
| WORKSTATION-04 related to | 11 of 11 workstations | 2 of 11 |
| Entities on the flagship incident | 15 | 6 |
| Containment target | FILESERVER-01, arjun | **WORKSTATION-04, priya** |

Targets are now resolved from the **worst alert's** entities, reusing the
same ranking that names the incident — so the title and the action can no
longer disagree about which machine is compromised.

**Four of five "enforced by the database" constraints did not exist.**
`db/schema.sql` is PostgreSQL DDL and nothing executes it; the schema is
built by `Base.metadata.create_all()`. All three audit probes succeeded
against the running database. Moved into `models.py` as `CheckConstraint`
and `__table_args__`, plus the ledger trigger via a dialect-aware
`event.listen` hook:

```
alerts      2 CHECK constraints        AI alert at CRITICAL      REJECTED
incidents   4 CHECK constraints        ledger row modified       REJECTED
actions     1 CHECK constraint         ai_score_delta = 999      REJECTED
triggers    ledger_no_update, ledger_no_delete
```

**The graph did not survive a restart.** `uvicorn --reload` restarts on
every file save, blanking the attack graph while the incident card still
read 100. It now warms from stored events on startup, and the graph endpoint
rebuilds if it finds itself cold.

**The chain could only ever reach 5 of 7 stages.** Persistence fell through
to `_emit_generic`, which writes the phase *description* into the command
line — the rule looks for `schtasks`, the description said "Scheduled task".
Evasion was structurally unreachable: no rule emitted `TA0005` at all. Added
`_emit_persistence`, `_emit_evasion` and a `defence_impairment` rule.
**Now 7/7, and 11 rules rather than 10.**

**Detection was never measured against the ground truth we generate.**
Attack events now carry `truth_technique`, read by `GET /api/benchmark` and
by nothing else — no rule may read it, or the measurement is circular:

```
techniques planted 13 · detected 13 · recall 100% · missed: none
events     planted 23 · detected 20 · recall 87%
false positives    9 alerts on 2,177 benign events = 0.52%
```

**Alert-flood detection could be silently disabled by batch ordering.** The
warm-up took `max(baseline, rate)`, so a large first batch set the bar out
of reach. Now seeded from a constant with a median over warm-up, and a flood
arriving during warm-up is still caught — verified across four orderings.

**Smaller:** `/api/incidents` defaulted to returning all 37 rows including
36 seeded historical records — now defaults to `status=open`;
`pipeline.py`'s header claimed "no AI anywhere in this file" while ending in
an `assist.reconcile()` call, now stated accurately; `related()`'s comment
described a cutoff the code did not implement, removed.

---

## 3 · ~~The gap you should care about most~~ — closed

**The demo could not show campaign linking.** It needed two or more open
incidents and the scripted attack was one coherent chain on one victim, so
`propose_links()` returned `too_few_incidents` every time. A feature built,
tested and documented, that the demo never reached.

`scenario.expand_second_victim()` now runs during step 4: the attacker uses
the harvested credential from a **different account on a different machine
that shares no entity with the first**. The entity graph correctly makes
that a separate incident — there is no edge to walk — and then the model
proposes they are one campaign, seven deterministic checks gate the
proposal, and an analyst merges them.

```
after step 4: 3 open incidents      (was 1)
full run    : 5 open incidents
```

That is the sixty seconds worth filming: the graph produced two incidents,
the model saw one attack, and a named human agreed.

---

## 4 · What is genuinely strong

**Dual-path analysis, and what it does with disagreement.** Two independent
methods on the same events, and the system never resolves a conflict between
them by picking a winner:

```
                          rules  model  final  agreement           review
both alarmed                100     95    100  agreed                   -
mild divergence              60     78     78  minor_disagreement       -
rules calm, model alarmed    20     85     45  disagreement           YES
rules alarmed, model calm     90    10     90  disagreement           YES
```

The last row is the design in one line: the model wanted to talk a 90 down
to a 10, the score stayed at 90, and it went to a human. The escalation cap
in row 3 matters too — the model can raise 20 to 45, not to 100, so one
confused response cannot mark everything critical and make the gate
meaningless.

**The authority separation is now measurable, not asserted.** Same event
stream, model off then on:

```
identical event stream : 2214 events both passes
verdict off            : High Confidence at 100.0
verdict on             : High Confidence at 100.0
AI-raised alerts       : 0 → 1
```

That is a script anyone can run, not a claim on a slide.

**The bounds are enforced in three places, not one.** Policy, code, and the
schema:

```sql
CHECK (origin <> 'ai_triage' OR severity IN ('informational','low','medium'))
CHECK (ai_score_delta BETWEEN -10 AND 15)
CHECK (tier > 1 OR rollback IS NOT NULL)
CREATE TRIGGER ledger_no_update BEFORE UPDATE OR DELETE ON ledger
```

A prompt can be argued with. A CHECK constraint cannot. When someone asks
*"what stops the AI from escalating itself"*, the answer is a line of DDL.

**The adversarial tests are the right kind of test.** `verify_assist.py`
stubs the model to return the payloads a compromised one would produce —
invented event ids, invented techniques, links to incidents that do not
exist, a request for +90 points — and shows each one being rejected with a
named reason. Testing a boundary by feeding it well-behaved input proves
nothing.

**Prompt injection is handled at the right layer.** Attacker-controlled text
lives in exactly one column, goes through one function, and is redacted
before any model sees it — and the attempt is raised as an alert in its own
right rather than silently dropped. Step 5 of the demo remains the thing
nobody else will have.

**The system is fast enough that nothing on stage will hang.** The full
seven-step demo is 6.5 seconds of wall clock, and every model call is
off-thread with a deterministic fallback.

---

## 5 · What is thin

**The frontend is not wired.** This is the largest remaining item by far.
64 endpoints exist and the prototype in `../S27_frontend_prototype.html`
predates the demo bar, the threat map, the remediation panel and everything
added since. Nothing you have built is visible yet.

**Ten detection rules is a small number.** Defensible — they cover the chain
the demo exercises and you can say so — but if asked *"what about an attack
you did not write a rule for"*, the honest and much better answer is now the
anomaly baseline plus AI triage. Make sure that answer is rehearsed, because
it is the one that distinguishes this project.

**Free-tier headroom is now the tightest constraint.** Path B adds up to
five analysis calls and one assessment per run, taking the total to
**13–18 calls**. Against Groq's 850/day that is roughly **50 full runs**,
down from 80. Two caps are the only thing keeping it bounded —
`TRIAGE_CALLS_PER_RUN = 4` and `ANALYSIS_CALLS_PER_RUN = 5` — and raising
either casually will cost you a rehearsal day. The content-hash cache means
repeated runs of the same scenario are free, so rehearse with
`regenerate=False`.

**Single-victim scenarios limit the kill-chain breadth.** Runs top out at
5 of 7 stages. Not a defect, but if someone asks why not 7, the answer is
that the scripted chain does not include a persistence or evasion technique
with a matching rule.

---

## 6 · What to do next, in order

| | Task | Why |
|---|---|---|
| **1** | Second victim in the scenario | Unlocks campaign linking — currently a built feature you cannot show |
| **2** | Wire the frontend to the 64 endpoints | Everything else is invisible without it |
| **3** | Build the disagreement panel first | `GET /api/disagreements` and `/verdicts` are the newest and most distinctive thing here. Two verdicts side by side is a screen nobody else will have |
| **4** | Rehearse the AI-off demo | Your strongest single moment, and it needs to be smooth |
| **5** | Rehearse the local-Ollama path | Converts the compliance objection into a design decision |
| **6** | Watch the call budget | 13–18 per run now. Rehearse with `regenerate=False` so the cache absorbs it |

~~Delete the 590 dead lines~~ · ~~wire the unused config~~ — both done.

---

## 7 · The three sentences to have ready

When a judge asks the hard questions, these are the answers the code will
now support:

> **"How do I know the AI isn't just making this up?"**
> Turn it off. Same events, same verdict, same score — here is the script.
> The model added one finding and changed nothing.

> **"What stops it escalating its own privileges?"**
> A CHECK constraint. It cannot raise an alert above medium, it cannot lower
> a deterministic score at all, and it cannot merge two incidents — a person
> does that.

> **"Is this really an AI system, or rules with a chatbot bolted on?"**
> Two analysts read every window. One is rules, one is a model, and neither
> sees what the other concluded. Measured contribution is 51% model. Here is
> the endpoint.

> **"What happens when they disagree?"**
> Nothing gets resolved automatically. We act on whichever is more worried
> and put it in front of a person. An incident two methods disagree about is
> not a low-risk incident — it is one nobody understands.

> **"What does it do when nothing is wrong?"**
> Fifteen out of a hundred. We measured it, because a detector that cannot
> stay quiet is not a detector.
