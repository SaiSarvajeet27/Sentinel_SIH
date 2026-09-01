# Sentinel SOC

**Human-Governed Autonomous SOC** — SOAIDEATHON-S27

Phishing, identity abuse and ransomware response, with a model doing real
analytical work and a person holding every decision that cannot be undone.

Adapted from the structure of `trust-ai-console`, rebuilt for security
operations with **PostgreSQL** and **Gemini** for every model task, with
**Ollama** as a fully local alternative.

---

## The flow

```
 1. Login
 2. Dashboard
 3. Generate security events     ← Gemini writes the plan · code expands it
 4. Detection ─┬─ A · Sigma rules + anomaly baseline
               └─ B · the model reads the same window, blind
 5. Correlation ┬─ A · entity graph, weighted paths, hub suppression
                └─ B · the model proposes links the graph could not walk
 6. Scoring ────┬─ A · kill-chain breadth × criticality × privilege
                └─ B · the model's own verdict, blind to A
 7. RECONCILE                    ← agree · differ · disagree → a human
 8. Attack chain generation      ← ATT&CK mapping, deterministic
 9. Explanation                  ← the model's, cited and validated
10. Remediation plan             ← the model writes it · policy sets the tier
11. Human approval               ← tier 2/3 gate
12. Execute simulated response
13. Audit log                    ← hash-chained, append-only

 ├─ Prompt injection detection   ← at the boundary, raises its own alert
 ├─ Alert-flood detection        ← somebody may be burying the signal
 ├─ Evidence provenance          ← sha256 per event + signed ledger
 ├─ Analyst feedback             ← rule scoreboard, retirement proposals
 └─ Real-time alerts             ← WebSocket
```

Steps 4, 5 and 6 each run **twice, independently**. Step 7 is where that
stops being a curiosity and becomes the design.

---

## Two analysts

**One is a set of rules and a graph. The other is a language model. They
read the same events, neither is told what the other concluded, and then we
compare.**

That is the whole architecture, and three things follow from it:

1. **We act on whichever is more worried.** This is how dual-sensor safety
   systems work — you do not average two altimeters, you believe the lower
   one. It also makes the model genuinely equal in its ability to escalate
   and structurally unable to dismiss.
2. **Agreement is evidence.** Two independent methods reaching the same
   verdict is worth more than either alone, and the confidence driver says
   so.
3. **Disagreement is itself a finding.** If the rules say 20 and the model
   says 85, that is not a low-risk incident — it is an incident nobody
   understands, and a person is told regardless of either score.

```
                          rules  model  final  agreement           review
both alarmed                100     95    100  agreed                   -
mild divergence              60     78     78  minor_disagreement       -
rules calm, model alarmed    20     85     45  disagreement           YES
rules alarmed, model calm     90    10     90  disagreement           YES
```

Row 4 is the one to point at. The model wanted to talk a 90 down to a 10.
**The score stayed at 90 and the incident went to a human.**

### Where each path contributes

| Stage | Deterministic | Model (Gemini) |
|---|---|---|
| **Detection** | 11 Sigma rules + a statistical anomaly baseline | Reads the same windows blind, writes findings from a catalogue of 14 techniques. Capped at **medium** severity, and there is no field for "this is benign" |
| **Correlation** | Entity graph, weighted paths, hub suppression | Proposes campaign links the graph could not walk. Seven checks gate them; a named human merges |
| **Scoring** | Kill-chain breadth × criticality × privilege × velocity | Its own blind verdict, plus a ±15/−10 contextual adjustment. Cannot lower the deterministic score |
| **Narrative & remediation** | — | The model's alone. Tiers and blast radius stay with policy |

**Measured, not claimed:** `GET /api/assist/balance`

```
detection                  det   8  model  10   ->  44% /  56%
correlation                det   2  model   0   -> 100% /   0%
scoring                    det   2  model   2   ->  50% /  50%
narrative_and_remediation  det   0  model   2   ->   0% / 100%

HEADLINE: deterministic 49%  ·  model 51%
```

The unit is *distinct analytical conclusions*, with the four stages weighted
equally, and the endpoint also returns raw alert counts (37 vs 10) because
they tell a very different story and hiding that would be the dishonest
version of this number. One rule firing on forty events is not forty pieces
of analysis.

**Everywhere the model could make the system miss something it is bounded
hard. Everywhere it could make it notice something it is given room.**

Prove it in fifteen seconds:

```bash
python scripts/verify_assist.py     # no API key needed
```

The model is stubbed to return the payloads a compromised or confused one
would produce, because that is the only honest way to test a boundary.

---

## ⚠ One thing to be clear about

The problem statement says *"without exposing sensitive logs to external
services."* Gemini is an external service.

**The honest position, which is defensible:**

| | |
|---|---|
| **Gemini** — every model task | Sends incident data out. **All of it is synthetic**, so nothing sensitive leaves |
| **Ollama** — the same code, locally | Set every `LLM_*` variable to `ollama` and the application is fully air-gapped |

Say this to a judge: *"we use hosted models for development speed on
synthetic data; the architecture is provider-agnostic and runs entirely
local — here it is with the network disconnected."* Then flip the env vars
and show it.

**Demonstrate the local path at least once on camera.** It converts a
weakness into a design decision.

---

## Setup

### 1. PostgreSQL

```bash
createdb sentinel
createuser sentinel --pwprompt        # password: sentinel
```

Or with Docker:

```bash
docker run -d --name sentinel-db -p 5432:5432 \
  -e POSTGRES_USER=sentinel -e POSTGRES_PASSWORD=sentinel \
  -e POSTGRES_DB=sentinel postgres:16
```

### 2. Python

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python scripts/bootstrap.py        # creates schema, org inventory, rules, playbooks
```

### 3. API key — free, no card needed

One key, from [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
New keys start `AQ.` and that is correct; the old `AIza` format is being
retired.

```bash
cp .env.example .env
# paste the key into .env  (NOT .env.example — that file is committed)
python scripts/check_ai.py
```

**Check your rate limit** at
[aistudio.google.com/rate-limit](https://aistudio.google.com/rate-limit) and
set `GEMINI_RPM` / `GEMINI_RPD` in `.env` to match. Google no longer
publishes a fixed free-tier table and the limits have been cut more than
once; the defaults here are deliberately pessimistic.

### 4. Local fallback *(recommended — set it up before demo day)*

```bash
ollama pull qwen2.5:7b
```

### 5. Run

```bash
python scripts/bootstrap.py      # prints three accounts and their passwords
python scripts/demo_day.py       # pre-flight: checks everything, then tells you
uvicorn app.main:app --port 8000
```

Open **http://localhost:8000/** and sign in. That page is
`index.html` — a deliberately plain reference client, not the product. Every
control on it calls a real endpoint and renders what comes back, so it
answers one question: does the backend actually work? Replace it with the
real frontend; the `api()` wrapper at the bottom of the file is the whole
client surface.

### Authentication — there is no demo mode

Every route requires a bearer token, every mutating route checks a role, and
the role comes from inside the signed token rather than from the request
body. A client cannot promote itself by asking.

Bootstrap creates one account per role, because the interesting thing to
demonstrate is that an analyst **cannot** do what a senior analyst can:

| Role | May approve |
|---|---|
| `analyst` | tier 0–1 only. Cannot suspend an account or isolate a host |
| `senior_analyst` | tier 2. Can retire rules and change settings |
| `manager` | tier 3, and the ledger tamper test |

Verified against a live server:

```
analyst starts the demo          -> 403  role 'analyst' cannot change_settings
senior,  5-character reason      -> 400  a reason of at least 10 characters is required
ANALYST, good reason, tier 2     -> 403  role 'analyst' cannot approve_tier_2
SENIOR,  good reason, tier 2     -> 200  status=executed  by=['u_002']
```

`JWT_SECRET_KEY` is generated and saved to `db/jwt_secret.key` on first run
if you do not supply one, so the application is secure by default rather
than secure only if you remembered to configure it.

**No `--reload` on demo day.** The entity graph lives in memory, and reload
restarts on every file save. It rebuilds from stored events now, but do not
rely on that on camera.

---

## Switching providers

Everything is controlled by environment variables. No code changes.

```bash
# hosted — the default
LLM_SCENARIO=gemini    LLM_EXPLAIN=gemini    LLM_ANALYSIS=gemini
LLM_ASSESS=gemini      LLM_TRIAGE=gemini     LLM_CORRELATE=gemini
LLM_REMEDIATION=gemini LLM_SCORE=off

# fully offline — one command does this for you
python scripts/use_local.py

# one path only — the rules run, the second analyst does not
DUAL_PATH=false

# no AI at all — everything else still works
AI_ENABLED=false
```

That last one is the demo control, and it now proves more than it used to.
**With `AI_ENABLED=false` the application must reach the same verdict**, not
merely keep running:

```
identical event stream : 2214 events both passes
verdict off            : High Confidence at 100.0
verdict on             : High Confidence at 100.0
AI-raised alerts       : 0 → 1
```

Written explanations disappear, the anomaly review does not happen, and
`base_score` equals `risk_score`. Everything else is unchanged. If something
else breaks, it was built in the wrong layer.

Fallback is automatic: if the configured provider is rate-limited or down,
`router.ask()` tries the others before giving up, and a failure returns
`ok=False` rather than raising. **Callers substitute a deterministic
template — the pipeline never stops because a model did.**

---

## Structure

```
app/
  config.py            all tuning in one place — tiers, weights, stages,
                       thresholds, and the bounds on every AI proposal
  llm/
    base.py            LLMResult + defensive JSON extraction
    providers.py       Gemini and Ollama behind one interface
    router.py          task → provider, with fallback. The only public entry
    quota.py           free-tier budgets, deliberately below the ceilings
  services/
    pipeline.py        ⚙ the deterministic core — detect, baseline, graph,
                       cluster, score. No AI anywhere in this file
    sanitise.py        ⚠ the security boundary · clean + detect injection
    assist.py          🧠 path B — blind analysis, blind assessment, and
                       the reconciliation between the two paths. Also
                       anomaly triage, campaign linking, score adjustment
    remediate.py       🧠 AI writes the fix, policy sets the tier
    explain.py         🧠 six explanation fields in ONE batched call
    scenario.py        Gemini plan → deterministic event expansion
    noise.py           25 staff, an ordinary day, with a realistic long tail
    respond.py         playbooks, tiers, blast radius, approval, rollback
    governance.py      ledger, feedback, org facts
    agents.py          the transparency trail + Trust Time Machine
    devices.py         fleet view with a derived, explainable risk score
    metrics.py         KPIs, charts, threat map, health
    demo.py            the seven-step guided demo
  main.py              69 endpoints + WebSocket
db/
  schema.sql           PostgreSQL reference copy of the model schema
scripts/
  bootstrap.py         one-command setup
  verify_assist.py     the adversarial tests — run this in front of a judge
  demo_day.py          pre-flight: deps, schema, constraints, providers,
                       the suite, and the two things that bite on the day
```

### Five things enforced by the database, not by convention

```sql
CONSTRAINT reversible_if_auto CHECK (tier > 1 OR rollback IS NOT NULL)
```
An automatic action without an undo plan cannot be inserted.

```sql
CONSTRAINT ai_alerts_capped CHECK (
    origin <> 'ai_triage' OR severity IN ('informational', 'low', 'medium'))
```
Only a written rule may call something critical — because only a rule can be
reviewed before it fires.

```sql
CHECK (ai_score_delta BETWEEN -10 AND 15)
```
The model's room to move a score is a column constraint, not a request in a
prompt.

```sql
CONSTRAINT model_never_lowers CHECK (
    model_score IS NULL OR risk_score >= base_score + ai_score_delta - 0.01)
```
The second analyst can escalate and cannot dismiss. This is the property the
whole design rests on, so it does not depend on one function staying correct.

```sql
CREATE TRIGGER ledger_no_update BEFORE UPDATE OR DELETE ON ledger ...
```
The audit ledger rejects updates and deletes at the database level.

---

## Status — verified working

`python scripts/verify_assist.py`, on SQLite with no API keys:

```
1 · DETECTION — the model tries to invent evidence
    accepted : T1048 on evt_real_001 — severity medium (cap is medium)
    discarded: evt_DOES_NOT_EXIST — no such event in the batch
    discarded: evt_real_002       — technique 'T9999.INVENTED' not in catalogue
    discarded: evt_real_002       — confidence 0.21 is below the 0.55 bar

2 · CHAIN — the model tries to link things that are not linked
    PROPOSED : …j4nxx5 ↔ …9v61p1  confidence 0.82 — all 7 checks passed
    rejected : 3 more, failing both_incidents_exist · describes_a_progression
               · cited_entities_are_real · confidence_above_bar

  ANALYST ACCEPTS proposal 1
    risk now 100.0, spanning 2 of 7 stages, attributed to Simran Singh

3 · SCORING — the model tries to move the number
    asked for +90   granted +15
    asked for -80   granted -10
    78 -10 = 68, but the final score is 75   (critical floor held)
    asked for +12 with no argument attached   granted +0

4 · SAME SCENARIO, MODEL OFF THEN ON
    identical event stream : 2214 events both passes
    verdict off / on       : High Confidence at 100.0 — unchanged
```

And the measurement that matters more than any of them — **what the system
does on a day when nothing happens:**

```
A NORMAL DAY · 1,817 events, no attack
  worst score 15.4  (Low — Verify Manually) — nothing reaches Review

THE SAME DAY, WITH THE ATTACK
  100.0 | 7/7 stages | High Confidence | Shadow copies deleted — recovery inhibited
```

And the detection rate, against ground truth we generate ourselves:

```
GET /api/benchmark
  techniques planted 13 · detected 13 · recall 100% · missed: none
  events     planted 23 · detected 20 · recall  87%
  false positives    9 alerts on 2,177 benign events = 0.52%
```

Attack events carry the technique they were written to represent, and **no
detection rule reads that field** — so the number is a measurement rather
than a circular one, and a miss would be named rather than hidden.

**15.4 against 100.0.** A detection system that cannot stay quiet is not a
detection system, and this number is the one to put in front of a judge —
almost nobody measures it, and the ones who do not usually cannot.

The full seven-step demo runs in **7.1 seconds** of wall clock: 34 alerts,
five incidents topping out at 100.0 across all seven stages, containment
correctly targeting the compromised machine, and the ledger verifying.

Two isolated 30-point incidents became one 100-point incident when the
analyst accepted a link the graph could not have found. That is the clearest
sixty seconds in the whole demo.

### Bugs found and fixed during testing

| Symptom | Cause | Fix |
|---|---|---|
| Duplicate key on `alerts` | `str(ULID())[:10]` is the millisecond timestamp — it collides | use the full ULID |
| Every event merged into one incident | the domain controller made every user two hops from every other | seed known infrastructure as hubs from the first event, and never let a hub anchor a cluster |
| Ledger verification failed | the timestamp in the hash did not survive the database round-trip identically | hash a stable formatted string |
| Anomaly baseline found nothing | the background generator was *too* tidy — the attack was the only rare thing, so "rare" and "malicious" meant the same word | gave the noise a realistic long tail: rare-but-innocent software, mistyped passwords, new SaaS domains |

The second one is the one to remember. **Naive graph clustering does not work
on real infrastructure**, and the failure is silent — you get one enormous
incident and no error.

The fourth is worth remembering too, for a different reason. It is the
failure mode that makes anomaly detection look far better than it is, and
almost every demo of this kind has it.

---

## What is built

| Module | State |
|---|---|
| `config.py` — tiers, stages, weights, autonomy, AI bounds | ✅ |
| `models.py` + `db/schema.sql` — Postgres, four enforcement rules | ✅ |
| `llm/` — Gemini and Ollama, routing, fallback, quota, backpressure | ✅ |
| `services/sanitise.py` — the boundary, injection detection | ✅ tested |
| `services/pipeline.py` — detect, anomaly baseline, graph, cluster, score | ✅ tested |
| `services/assist.py` — AI triage, campaign linking, score adjustment | ✅ tested |
| `services/remediate.py` — AI-authored fix, policy tier | ✅ tested |
| `services/explain.py` — six fields, one call, validation, consistency | ✅ |
| `services/respond.py` — playbooks, tiers, blast radius, approval | ✅ tested |
| `services/governance.py` — ledger, feedback, org facts | ✅ tested |
| `services/agents.py` — transparency trail, Trust Time Machine | ✅ |
| `services/devices.py` — fleet view, derived risk with reasons | ✅ |
| `services/metrics.py` — KPIs, charts, threat map, health | ✅ |
| `services/demo.py` — the seven-step guided demo | ✅ |
| `main.py` — 69 endpoints, WebSocket | ✅ |
| `scripts/bootstrap.py` · `scripts/verify_assist.py` | ✅ |

The frontend now wires the dashboard, incidents, explanations, independent
verdict/disagreement review, approvals, demo controls and ledger verification.
The prototype in `../S27_frontend_prototype.html` still predates the seven-step demo
bar, the threat map and the remediation panel.

Endpoint-by-endpoint mapping to the UI is in `FEATURE_COVERAGE.md`.

---

## Free-tier arithmetic

Gemini carries every task now, so the budget is much tighter than it was
with two providers. Measured, not estimated — one full run with
`regenerate=False`:

| | Calls |
|---|---|
| Second analyst (path B) | 2 — capped by `ANALYSIS_CALLS_PER_RUN` |
| Anomaly triage | 1 — capped by `TRIAGE_CALLS_PER_RUN` |
| Campaign linking | 1 |
| Blind assessment | 1 |
| Explanation, batched | 1 |
| Remediation plan | 1 |
| **Total** | **7** |

`LLM_SCORE` is **off** by default: it asks the model to adjust a number it
has been shown, while `LLM_ASSESS` asks for its own verdict blind. The
second is better evidence, and with one provider a duplicated question is a
wasted request.

What that buys you depends on a limit only you can see, at
[aistudio.google.com/rate-limit](https://aistudio.google.com/rate-limit):

| Your RPD | Full runs per day |
|---|---|
| 180 | ~25 |
| 50 | ~7 |
| 20 | **~2** |

**If your limit is at the low end, rehearse on Ollama and save Gemini for
the take you are filming.** `python scripts/use_local.py` switches every
task in one command and `--hosted` switches back. A repeated scenario is
served from the content-hash cache and costs nothing, so
`regenerate=False` is the setting to rehearse with.

When the per-minute window fills, `quota.wait_for_slot()` **waits up to 25
seconds** rather than quietly dropping to a deterministic template. A
per-minute limit clears by itself; a daily one does not, and it returns
immediately for that case.

```
GET /api/ai/usage
→ { "providers": { "gemini": {"minute": 8, "day": 180} },
    "cache": { "hits": 31, "misses": 6, "hit_rate": 0.838 } }
```


---

## The seven demo steps

Driven by `POST /api/demo/next` and `/play`, matching the stepper in the UI:

1. **Baseline operational state** — ordinary activity, no incidents. The
   anomaly baseline is learning what normal looks like here
2. **Phishing email delivered** — one low-severity alert, meaningless alone
3. **Endpoint compromise** — alerts begin connecting, an incident forms.
   *The model reviews the oddities no rule matched and mostly stays silent*
4. **Identity abuse detected** — risk climbs on *stages*, not alert count.
   *The model proposes a campaign link; the gate checks it; you accept it*
5. **Adversarial content blocked** — injection raised as its own alert,
   **verdict unchanged**
6. **Ransomware staging & AI analysis** — shadow copies deleted, the
   narrative written, and the model argues for a score adjustment it gets
   ±15 of
7. **Human approval & containment** — the model writes the fix, two tier-2
   actions are held for a person

Step 5 is the one nobody else has. Step 4 is the one that shows the model
finding something the deterministic layer could not — and then asking.
