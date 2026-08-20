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
python -m uvicorn app.main:app --port 8000
```

```bash
# Terminal 2 — frontend
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** and log in with the credentials `bootstrap.py`
printed to the terminal (or the ones under [Default login](#default-login)
below, if you're running the seeded database already in this repo).

The backend defaults to **SQLite** (`sentinel.db`, created automatically) so
this works with nothing else installed. Point `DATABASE_URL` in `.env` at a
local Postgres instance instead if you want the production-shaped path —
see `backend/.env.example` for the connection string.

There's no "start demo" button to click — shortly after the backend
starts, and then every `AUTO_GENERATE_INTERVAL_MINUTES` (default 120)
after that, it generates a complete new incident on its own: a fresh
Gemini-authored attack plan, real detection, real dual-path AI analysis,
and a real remediation proposal waiting in Approvals. It tracks when the
last cycle actually ran (in the database, not in memory), so restarting
the backend doesn't fire an extra one — it just picks up wherever it left
off. Set `AUTO_GENERATE_ENABLED=false` in `.env` if you'd rather control
exactly when that happens.

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
120-minute interval (`AUTO_GENERATE_INTERVAL_MINUTES`) keeps that around
12 cycles/day, with margin to spare. Even going over the quota doesn't
stop anything — the router falls back to Groq automatically, so
generation keeps producing fresh AI-authored scenarios either way (see
[AI models used](#ai-models-used)). If you want to check your actual
limit, it's shown at https://aistudio.google.com/rate-limit.

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

`scripts/bootstrap.py` creates one account and prints its password to the
terminal on first run (or generates one if `BOOTSTRAP_ADMIN_PASSWORD` is
left blank in `.env`). The database already seeded in this repo uses:

| Email | Role | Can approve |
|---|---|---|
| `admin@sentinel.local` | `manager` | Tier 0–3 (including two-person Tier 3 actions) |

The role model has three tiers (`analyst` → `senior_analyst` → `manager`),
each with strictly increasing approval authority — see
`backend/app/config.py` for the exact permission table. Create additional
accounts by re-running bootstrap with `BOOTSTRAP_SENIOR_EMAIL` /
`BOOTSTRAP_ANALYST_EMAIL` set in `.env` to demonstrate the tier boundaries
(an `analyst` account genuinely cannot approve what a `manager` can — it's
enforced server-side, not hidden in the UI).

---

## Useful scripts (run from `backend/`)

| Script | What it does |
|---|---|
| `python -m scripts.bootstrap` | One-time setup: creates tables, seeds the organisation and detection rules, generates the ledger's signing key, seeds historical incidents |
| `python scripts/demo_day.py` | Pre-flight check before a demo — verifies config, keys, and DB state, and tells you what's wrong if something isn't ready. `--serve` also starts uvicorn afterwards |
| `python scripts/check_ai.py` | Confirms both AI providers are reachable with a cheap call each |
| `python scripts/use_local.py` | Rewrites every `LLM_*` route in `.env` to `ollama` for a fully offline run; `--hosted` switches back |
| `python scripts/verify_assist.py` | Adversarial test suite — proves the model's contribution is bounded (can't invent detections, can't set its own risk tier, can't dismiss what the deterministic path flagged). No API key needed |
| `pytest` | Unit tests |

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
