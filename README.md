# Sentinel SOC

**Human-Governed Autonomous SOC** — built for SOAIDEATHON-S27 (Smart India Hackathon 2026 selection round), ITER, Siksha 'O' Anusandhan.

Phishing, identity abuse and ransomware response, with a language model doing
real analytical work and a person holding every decision that cannot be
undone.

Two independent analysts look at the same telemetry — a deterministic engine
(Sigma rules, an entity graph, kill-chain arithmetic) and a language model
that never sees what the first one concluded. Their verdicts are reconciled,
not averaged: the system acts on whichever is more worried, and any
disagreement between them is itself treated as a finding and sent to a
human. Nothing a language model proposes executes on its own if it can't be
undone — tier and blast radius come from policy, never from the model, and
Tier 2/3 actions wait for a named, authenticated person. Every AI verdict,
human decision and executed action is written to an append-only ledger,
hash-chained with SHA-256 and signed with Ed25519, so the audit trail can be
verified after the fact rather than taken on trust.

This repo holds both halves of the system:

```
SentinelSOC/
├── backend/     FastAPI + SQLAlchemy — detection, correlation, scoring,
│                governance, the signed ledger, 60+ REST endpoints + WebSocket
└── frontend/    React + TypeScript + Vite — the SOC console
```

---

## Quick start

Two terminals, backend first. If you just want the app running as fast as
possible and don't care about AI yet, skip straight to step 3 with
`AI_ENABLED=false` — you can add real keys later without reinstalling
anything.

```bash
# Terminal 1 — backend
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows. Use `source .venv/bin/activate` on macOS/Linux
pip install -r requirements.txt
copy .env.example .env          # Windows. Use `cp .env.example .env` on macOS/Linux
```

Now open `backend/.env` in an editor and either paste in API keys (see
[Getting API keys](#getting-api-keys) below — takes about 2 minutes per
provider, both free, no credit card) or set `AI_ENABLED=false` to skip AI
entirely for now. Then:

```bash
python -m scripts.bootstrap     # creates the database, seeds the org, prints login credentials
python -m uvicorn app.main:app --reload --port 8000
```

```bash
# Terminal 2 — frontend
cd frontend
npm install
npm run dev
```

Wait for `Sentinel SOC ready` in Terminal 1 before you open the browser —
the login page reports an unreachable backend and a wrong password with the
same message, so starting the frontend first just produces a confusing
"invalid credentials".

Then open **http://localhost:5173** and log in with:

| | |
|---|---|
| **Email** | `admin@sentinel.local` |
| **Password** | `SecureAdminPass123!` |

That is the manager account, which can approve everything. Two more
accounts (senior analyst and plain analyst) are under
[Default login](#default-login) below, along with what to check when a
login fails.

The backend defaults to **SQLite** (`sentinel.db`, created automatically) so
this works with nothing else installed. Point `DATABASE_URL` in `.env` at a
local Postgres instance instead if you want the production-shaped path —
see `backend/.env.example` for the connection string.

There's no "start demo" button to click — shortly after the backend
starts, and then every `AUTO_GENERATE_INTERVAL_MINUTES` (default 15)
after that, it generates a complete new incident on its own: a fresh
Gemini-authored attack plan, real detection, real dual-path AI analysis,
and a real remediation proposal waiting in Approvals. It tracks when the
last cycle actually ran (in the database, not in memory), so restarting
the backend doesn't fire an extra one — it just picks up wherever it left
off. Set `AUTO_GENERATE_ENABLED=false` in `.env` if you'd rather control
exactly when that happens.

---

## Live Threat Response Demo (Round 2 Showcase)

SENTINEL-X includes a dedicated **Live Threat Response Demo** accessible directly from the top navigation bar, the sidebar (`Live Threat Demo`), the dashboard showcase card, or at `/live-demo`.

This feature provides a deterministic, simulated end-to-end SOC workflow demonstrating telemetry generation, normalization, Sigma rule detection, AI-assisted reasoning, incident creation, response recommendation, mandatory human authorization, governed response execution, and SHA-256 hash-chained audit logging.

```
EVENT GENERATED
      ↓
EVENT PROCESSED
      ↓
SIGMA RULE DETECTION
      ↓
AI EVALUATION
      ↓
INCIDENT CREATED
      ↓
RESPONSE RECOMMENDED
      ↓
HUMAN APPROVAL (Safety Interlock — Simulation Automatically Pauses)
      ↓
RESPONSE EXECUTED (Simulated)
      ↓
AUDIT TRAIL (SHA-256 Chained)
```

### Core Governance Principle
- **AI recommends.**
- **Human authorizes.**
- **Governed response is executed.**
- **Every step is audited.**

> **Prototype / Demo Disclaimer**: This project contains simulated security telemetry, detection, AI evaluation, and response execution for demonstration purposes. The live threat simulation is a prototype demonstration and does not execute real containment actions against production infrastructure.

---

## Live Demo — Judge Walkthrough (2–3 Minutes)

Follow this step-by-step flow during the presentation:

1. **Open Live Threat Demo**: Navigate to **[http://localhost:5173/live-demo](http://localhost:5173/live-demo)** or click **"Live Threat Demo"** in the sidebar.
2. **Start Simulation**: Click **"Start Live Threat Simulation"**.
3. **Stage 1 — Event Generated**: Observe synthetic telemetry (`EVT-LIVE-001`, Email Gateway, high severity phishing link click on `WORKSTATION-04` by `analyst.smith@sentinel.local`).
4. **Stage 2 — Event Processed**: Observe multi-source telemetry normalization and correlation across Email, Identity (Entra ID), and Endpoint EDR signals.
5. **Stage 3 — Sigma Rule Detection**: Observe simulated match for Sigma Rule `SOC-AUTH-001: Suspicious Authentication After Phishing Event` (MITRE ATT&CK `T1566.002` / `T1078`).
6. **Stage 4 — AI Evaluation**: Observe the dual-path AI assessment card with a 92% confidence score, root cause breakdown, *Why Act vs. Why Wait* analysis, and risk if ignored.
7. **Stage 5 — Incident Created**: Observe the creation of incident `INC-LIVE-001` (Severity: High, Risk Score: 88/100).
8. **Stage 6 — Response Recommended**: Observe playbook formulation (`Identity Containment`, Action: *Revoke active sessions*, Governance: Tier 2 Sensitive - Reversible). Notice the banner: **AI Recommendation ≠ Execution**.
9. **Stage 7 — Human Approval Required**: Notice that the workflow **automatically pauses** and engages the **Safety Interlock**. The system strictly refuses to execute without named analyst action.
10. **Human Decision**:
    - Click **`[ APPROVE ]`** to authorize the recommended action, or
    - Click **`[ REJECT ]`** to abort response execution with a documented reason, or
    - Click **`[ OVERRIDE ]`** to select an alternative action (e.g. *Trigger MFA Step-Up Challenge*), or
    - Click **`[ ESCALATE ]`** to escalate to Tier 3 / Senior Commander.
11. **Stage 8 — Response Executed**: Observe simulated response actuation (*"Revoke active sessions"* on `analyst.smith@sentinel.local`) confirming threat containment.
12. **Stage 9 — Audit Trail**: Inspect the live streaming audit ledger containing SHA-256 hash-chained records with sequence numbers, timestamps, actors, and parent hash links.
13. **Reset & Replay**: Click **`[ Reset Demo ]`** to return the state machine to its initial clean state, and adjust replay speed (`0.5x`, `1x`, `2x`, `4x`) as desired.

---

## Human-in-the-Loop Governance

SENTINEL-X enforces strict policy boundaries regarding automated actions:
- **No Autonomous High-Impact Execution**: The language model never holds authority to isolate hosts, revoke credentials, or modify policies without approval.
- **Safety Interlock**: Reaching Tier 2/3 containment automatically halts execution until a named, authenticated analyst explicitly decides.
- **Decision Controls**:
  - **Approve**: Authorizes the proposed response and triggers governed simulated execution.
  - **Reject**: Aborts execution, prevents unauthorized system changes, and records rejection in the audit trail.
  - **Override**: Records the operator override rationale and executes the analyst-selected alternative.
  - **Escalate**: Defers execution and forwards the request to senior incident commanders.

---

## Cryptographic Audit Ledger & Provenance

Every event in the live threat simulation is recorded sequentially in an audit ledger:
- Events logged: `EVENT_GENERATED`, `EVENT_PROCESSED`, `SIGMA_DETECTION`, `AI_EVALUATION`, `INCIDENT_CREATED`, `RESPONSE_RECOMMENDED`, `APPROVAL_REQUESTED`, `ANALYST_APPROVED` (or `REJECTED`/`OVERRIDDEN`/`ESCALATED`), `RESPONSE_EXECUTED`, and `AUDIT_COMPLETED`.
- Entries are linked using **SHA-256 hash-chained audit records** computed via the browser WebCrypto API.
- Each record displays its sequence index, timestamp, actor, source pipeline, execution status, evidence references, and parent/current SHA-256 hashes.

---

## Getting API keys

Two providers, both free, neither requires a credit card. This is the part
people get stuck on, so here it is click-by-click. **You can also skip this
whole section** — see [Running without any AI key](#running-without-any-ai-key)
at the bottom.

### 1. Gemini key (used for one thing: generating each new incident scenario)

1. Go to **https://aistudio.google.com/apikey** and sign in with any Google
   account.
2. Click **"Create API key"**.
3. Pick **"Create API key in new project"** if you don't already have a
   Google Cloud project selected — a default one is created for you
   automatically, no extra setup needed.
4. Copy the key it shows you. Current keys start with `AQ.` (older ones
   starting `AIza` still work, but Google is phasing that format out).
5. Open `backend/.env` and paste it in:
   ```bash
   GEMINI_API_KEY=AQ.your-key-here
   ```

Free-tier quota is small and varies per project — some projects get as few
as ~20 requests/day for `gemini-2.5-flash`. That's fine: this app only ever
spends **one** Gemini call per incident-generation cycle, and the default
15-minute interval (`AUTO_GENERATE_INTERVAL_MINUTES`) runs past that
quota a few hours into the day on purpose — going over it doesn't stop
anything, the router falls back to Groq automatically (900/day, easily
enough to cover the rest of the day at this pace), so generation keeps
producing fresh AI-authored scenarios either way, just from a different
model (see [AI models used](#ai-models-used)). Raise the interval if you'd
rather more of the day's cycles landed on Gemini specifically. If you want
to check your actual limit, it's shown at
https://aistudio.google.com/rate-limit.

### 2. Groq key (used for everything else — explanations, analysis, remediation)

1. Go to **https://console.groq.com/keys** and sign up or sign in (email,
   Google, or GitHub all work).
2. Click **"Create API Key"**.
3. Give it any name (e.g. `sentinel-soc`) and click **Create**.
4. Copy the key immediately — Groq only shows it to you once. It starts
   with `gsk_`.
5. Open `backend/.env` and paste it in:
   ```bash
   GROQ_API_KEY=gsk_your-key-here
   ```

Groq's free tier is a larger, published fixed daily allowance (not a
per-project unknown like Gemini's), which is why this app routes almost
everything through Groq — see [What each AI feature uses](#what-each-ai-feature-uses)
below.

### 3. Confirm both keys actually work

From `backend/`, with the venv active:

```bash
python scripts/check_ai.py
```

This makes one cheap request per provider (costs 2–3 requests total against
your daily quota) and tells you plainly which provider is reachable. It
never prints the key back to the terminal.

### Running without any AI key

You don't need either key to run the app. Two options, both in `backend/.env`:

- **`AI_ENABLED=false`** — the whole app runs with zero model calls. Every
  screen still works: detection, governance, approvals, the audit ledger.
  This is intentional, not a degraded mode — the project's core claim is
  that unplugging the AI produces the *same* detection verdict, and this
  setting is how you prove it.
- **Local model, still `AI_ENABLED=true`** — install
  [Ollama](https://ollama.com), run `ollama pull qwen2.5:7b`, then
  `python scripts/use_local.py` from `backend/`. This rewrites every
  `LLM_*` line in `.env` to route through your local Ollama instead of a
  hosted API — no key, no network call, fully offline. `--hosted` switches
  back.

---

## AI models used

The system runs three model providers behind one routing layer
(`backend/app/llm/router.py`), selected per task in `.env`. Every task falls
back automatically to the next provider in line if one is unavailable or
rate-limited (`groq → gemini → ollama`).

| Provider | Model | Used for | Notes |
|---|---|---|---|
| **Google Gemini** | `gemini-2.5-flash` | One-shot synthetic scenario generation at the start of each auto-generated incident cycle | Free-tier quota is small and project-specific (as low as ~20 requests/day observed) — kept to a single call per cycle for that reason, and falls back to Groq/Ollama automatically if the daily quota is used up |
| **Groq** | `openai/gpt-oss-120b` | Everything that repeats: alert explanation, incident analysis, both-sides verdict assessment, triage of unusual events, campaign-link correlation, remediation plan drafting | Carries the bulk of the AI workload; Groq's free tier is a larger, fixed daily allowance |
| **Ollama** (local) | `qwen2.5:7b` | Fully offline fallback for every task above | No API key, no network call — `python scripts/use_local.py` switches every `LLM_*` route to it in one command, for an air-gapped demo |

Reasoning-capable models on both Gemini and Groq can silently return an
empty response if their hidden "thinking" tokens consume the whole output
budget before the visible JSON is written — the router accounts for this
(`thinkingConfig.thinkingBudget: 0` on Gemini, `reasoning_effort: "low"` on
Groq's `gpt-oss` models) so responses come back reliably.

### What each AI feature uses

Everything below is one call-site each, selected by `TASK_PROVIDER` in
`backend/app/config.py` and overridable per-task via the `LLM_*` lines in
`.env` (see `.env.example` for the full list).

| Feature — what you see in the app | Backend task | Default provider |
|---|---|---|
| Generating each new auto-generated incident's attack scenario | `scenario` | Gemini |
| "Ask Why" panel — reasoning steps, evidence, why-act/why-wait, alternatives | `explain` | Groq |
| The AI's own independent read of an incident (the "second analyst" in the both-sides comparison) | `analysis` | Groq |
| The AI's own independent risk verdict, blind to the rules' score — reconciled against the deterministic score | `assess` | Groq |
| Reviewing events the deterministic rules found unusual but didn't fire a rule on | `triage` | Groq |
| Proposing that two separate incidents are the same campaign | `correlate` | Groq |
| Writing the remediation plan (the steps shown in Alternatives / Override) | `remediation` | Groq |

Everything outside this table — detection thresholds, risk-tier assignment,
blast-radius calculation, the audit ledger, and all governance/approval
logic — is deterministic and involves no AI at all, by design.

---

## Environment configuration

Backend config lives in `backend/.env`, copied from `backend/.env.example`.
The example file documents every variable inline; the essentials:

```bash
# backend/.env
DATABASE_URL=sqlite+pysqlite:///./sentinel.db      # or a Postgres URL

GEMINI_API_KEY=                                     # https://aistudio.google.com/apikey
GROQ_API_KEY=                                       # https://console.groq.com/keys
OLLAMA_HOST=http://localhost:11434                  # only needed for the offline path

AI_ENABLED=true                                     # false = rules-only, no model calls at all
DUAL_PATH=true                                      # false = rules only, one analyst instead of two

CORS_ORIGINS=http://localhost:5173                  # must match the frontend's origin

BOOTSTRAP_ADMIN_EMAIL=admin@sentinel.local
BOOTSTRAP_ADMIN_PASSWORD=                           # leave blank — one is generated and printed once
```

Frontend config lives in `frontend/.env`:

```bash
# frontend/.env
VITE_API_BASE=http://localhost:8000
```

If you change the backend's port, update both `VITE_API_BASE` here and
`CORS_ORIGINS` in `backend/.env` to match, or the browser will report a
CORS failure that actually means "the origins don't match."

---

## Default login

`scripts/bootstrap.py` creates three accounts, one per role, on first run —
their passwords come from `backend/.env.example`, which ships with fixed,
known values so the whole team gets the same working logins instead of
each person's bootstrap run generating its own random, unshared password:

| Email | Password | Role | Can approve |
|---|---|---|---|
| `admin@sentinel.local` | `SecureAdminPass123!` | `manager` | Tier 2 and Tier 3 (as one of two required signers) |
| `simran@sentinel.local` | `SecureSeniorPass123!` | `senior_analyst` | Tier 2 only, not Tier 3 |
| `arjun@sentinel.local` | `SecureAnalystPass123!` | `analyst` | Nothing — Tier 0/1 actions auto-execute and never reach the approval queue |

Log in as `arjun@sentinel.local` and try to approve a Tier-2 action to see
the boundary enforced server-side, not just hidden in the UI.

### "Invalid credentials" — check the backend is running first

The login page shows **one message for two completely different failures**:

> Invalid credentials, or the backend is unreachable at http://localhost:8000

In practice it is almost always the second one. Before touching passwords
or the database, confirm the backend is actually up:

```bash
curl -i http://127.0.0.1:8000/api/health
```

- **`401 Unauthorized`** — the backend is running correctly. That endpoint
  requires a token, so 401 is the healthy answer. Your credentials are fine;
  use the table above exactly as written.
- **Connection refused / no response** — nothing is listening. Start the
  backend (Terminal 1 above) and wait for `Sentinel SOC ready` before you
  try to log in.

Two things that look like credential problems but are not:

- **The backend does not auto-reload unless you pass `--reload`.** A server
  started before your last edit keeps serving the old code, which shows up
  as stale numbers on the dashboard rather than a login failure — but it is
  the same root cause: the process you are talking to is not the code you
  think it is.
- **`localhost` may resolve to IPv6 `::1` while uvicorn binds IPv4-only
  `127.0.0.1`.** Browsers usually fall back, but if the console cannot reach
  the API while `curl 127.0.0.1:8000` works, set
  `VITE_API_BASE=http://127.0.0.1:8000` in `frontend/.env`, or start the
  backend with `--host 0.0.0.0`.

If the backend *is* running and the credentials still fail, then it is one
of the two database cases: (1) the `.env` had blank passwords at bootstrap
time, so `bootstrap.py` generated a random one and printed it exactly once,
or (2) the database already had accounts from an earlier run — bootstrap
only creates the three accounts on a genuinely empty database and will not
retroactively fix existing ones. In either case, confirm `.env` matches
`.env.example`'s bootstrap section, delete `sentinel.db`, and re-run
`python -m scripts.bootstrap`.

To check what is actually stored without resetting anything:

```bash
python -c "import sqlite3; print(sqlite3.connect('sentinel.db').execute('SELECT email, role FROM app_users').fetchall())"
```

The role model has three tiers (`analyst` → `senior_analyst` → `manager`),
each with strictly increasing approval authority — see
`backend/app/config.py` for the exact permission table.

---

## Useful scripts (run from `backend/`)

| Script | What it does |
|---|---|
| `python -m scripts.bootstrap` | One-time setup: creates tables, seeds the organisation and detection rules, generates the ledger's signing key, seeds historical incidents |
| `python scripts/demo_day.py` | Pre-flight check before a demo — verifies config, keys, and DB state, and tells you what's wrong if something isn't ready. `--serve` also starts uvicorn afterwards |
| `python scripts/check_ai.py` | Live-checks Gemini and Ollama, then runs one real task through the router — the router line is the one that matters, since it exercises whichever provider is actually configured. **Known gap:** the script predates the Groq integration, so it prints `groq <-- not a valid provider` for every Groq-routed task and omits Groq from "Working providers". Groq is fine; the checker is stale. Trust the "one real task through the router" section at the bottom |
| `python scripts/use_local.py` | Rewrites every `LLM_*` route in `.env` to `ollama` for a fully offline run; `--hosted` switches back |
| `python scripts/verify_assist.py` | Adversarial test suite — proves the model's contribution is bounded (can't invent detections, can't set its own risk tier, can't dismiss what the deterministic path flagged). No API key needed |

There is no `pytest` suite yet — `pytest` is installed and collects zero
tests. `verify_assist.py` is the real verification path today: it asserts
the guardrails hold (the model cannot invent detections, cannot set its own
risk tier, cannot dismiss what the deterministic path flagged) and needs no
API key.

---

## Requirements

- **Python 3.11+**, **Node.js 18+**
- All Python dependencies are pinned with lower bounds in
  [`backend/requirements.txt`](backend/requirements.txt) — `fastapi`,
  `sqlalchemy`, `pysigma`, `networkx`, `scikit-learn`, `cryptography` (ledger
  signing), `passlib`/`python-jose` (auth), and a plain `httpx` client for
  all three LLM providers (no vendor SDKs). One pin is deliberate:
  `bcrypt>=4.0,<4.1` — `passlib`'s last release predates bcrypt 4.1's
  stricter backend check and raises on import otherwise.
- Postgres is optional — SQLite is the zero-setup default (`DATABASE_URL` in
  `.env` controls which one is used).
- Ollama is optional, only needed for the fully offline path.
- Frontend dependencies are pinned in
  [`frontend/package.json`](frontend/package.json) — React 19, Vite, Tailwind
  CSS 4, React Router 7, Recharts, and `@xyflow/react` for the attack graph.

---

## Features

- **Live Threat Response Demo**: 9-stage end-to-end simulated SOC workflow demonstrating detection, dual-path AI reasoning, safety interlock pausing, human authorization (`Approve`/`Reject`/`Override`/`Escalate`), and SHA-256 hash-chained audit logging.
- **SOC Command Dashboard**: Real-time event ingestion metrics, unresolved threat summaries, MTTR/MTTD analytics, playbook usage statistics, and operational health.
- **Incident & Alert Management**: Severity-categorized alerts, risk scoring (0–100), affected identity/workstation attribution, and MITRE ATT&CK mapping.
- **Interactive Attack Graph**: Entity graph and lateral movement visualization powered by `@xyflow/react`.
- **Dual-Path AI Investigation**: Independent AI threat analysis blind to deterministic scores, reconciled based on maximum risk with full *Why Act vs. Why Wait* decision support.
- **Playbooks & Remediation**: Structured response plans with clear separation between *AI Recommendation* and *Governed Execution*.
- **Human Governance & Approval Center**: Enforces authorization tiers (Tier 0–3). Provides 5 human controls: Approve, Reject, Override, Alternatives, and Escalate.
- **Cryptographic Evidence & Audit Registry**: Hash-chained audit ledger with server-side Ed25519 signatures and browser-side SHA-256 verification.
- **Trust & Rule Management**: AI trust score tracking, false positive rate tracking, rule retirement candidates, and override history.
- **AI Safety & Defense**: Interceptor for adversarial prompt-injection payloads embedded in telemetry.
- **Theme & Accessibility**: Full light mode (Daylight) and dark mode (Midnight) support with responsive enterprise UI.

---

## Application Routes

| Route | Description |
|---|---|
| `/` | Security Operations Center Command Dashboard |
| `/live-demo` | **Live Threat Response Demo** (also accessible via `/simulation` or `/simulator`) |
| `/incidents` | Incident & Alert Management Queue |
| `/incident/:id` | Incident Detail (Overview, Attack Graph, AI Investigation, Remediation Tabs) |
| `/approvals` | Human Governance & Authorization Center |
| `/rules` | Trust Scores, Rule Performance & Learning Loop |
| `/evidence` | Cryptographic Evidence Ledger & Hash Chain Verification |
| `/settings` | LLM Provider Routing, Autonomy Policies & System Settings |
| `/login` | Analyst Role Authentication |

---

## Project Structure

```
SentinelSOC/
├── backend/
│   ├── app/                 FastAPI application (routes, models, detection, LLM router, ledger)
│   ├── db/                  Database initialization and migrations
│   ├── scripts/             Bootstrap, verify, demo-day, and AI diagnostic scripts
│   └── requirements.txt     Backend dependencies
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── ai/          AI Investigation & decision support components
    │   │   ├── approval/    Human authorization cards and modals
    │   │   ├── audit/       Audit integrity and chain verification modals
    │   │   ├── common/      SOCContext, ThemeContext, badges, and shared UI
    │   │   ├── layout/      MainLayout, Sidebar, Topbar
    │   │   ├── live-simulation/ Live 9-stage pipeline, telemetry, Sigma, AI, and audit panels
    │   │   └── rules/       Detection rule management and trust cards
    │   ├── pages/
    │   │   ├── DashboardPage.tsx
    │   │   ├── LiveThreatSimulationPage.tsx  # Round 2 Live Threat Response Demo
    │   │   ├── IncidentsPage.tsx
    │   │   ├── IncidentDetailPage.tsx
    │   │   ├── HumanApprovalPage.tsx
    │   │   ├── EvidenceAuditPage.tsx
    │   │   ├── TrustRulesPage.tsx
    │   │   └── SettingsPage.tsx
    │   ├── services/
    │   │   ├── backendApi.ts                 # REST client for FastAPI backend
    │   │   ├── liveThreatSimulationService.ts # Unified 9-stage simulation engine
    │   │   ├── realtimeService.ts            # WebSocket connection
    │   │   └── socStore.ts                   # Central SOC reactive store
    │   ├── types/
    │   │   ├── liveSimulation.ts             # Live threat demo interfaces & state types
    │   │   └── soc.ts                        # Core domain models
    │   └── App.tsx          Router configuration
    └── package.json         Frontend dependencies
```

---

## Architecture notes

- **Governance tiers.** Actions are tiered 0–3 by policy
  (`backend/app/config.py`), never by the model. Tier 0–1 (read-only or
  easily reversible) can auto-execute; Tier 2 needs one human approval;
  Tier 3 needs two, from different accounts.
- **The ledger.** Every AI verdict, human approval/override/escalation, and
  executed action is appended to a hash-chained, Ed25519-signed audit log.
  `POST /api/ledger/verify` walks the real chain server-side — the
  frontend's "Verify Chain" control is a real cryptographic check, not a
  canned animation. The "Tamper Test" control is the one place that's
  explicitly simulated: it demonstrates what a broken chain looks like
  without touching the real ledger.
- **Windows-specific note.** A few backend scripts reconfigure stdout/stderr
  to UTF-8 on startup — without it, emoji/box-drawing characters in script
  output crash on the default `cp1252` Windows console encoding.

For the full endpoint-by-endpoint architecture writeup, see
[`backend/README.md`](backend/README.md),
[`backend/ANALYSIS.md`](backend/ANALYSIS.md), and
[`backend/FEATURE_COVERAGE.md`](backend/FEATURE_COVERAGE.md).
