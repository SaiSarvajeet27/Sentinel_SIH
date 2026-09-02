# Sentinel SOC — Frontend Console

React 19, TypeScript, Vite, and Tailwind CSS web console for SENTINEL-X Human-Governed Autonomous SOC.

---

## Development & Build Commands

```bash
# Install dependencies
npm install

# Start local development server (runs on http://localhost:5173)
npm run dev

# Run TypeScript type checks and build production bundle
npm run build

# Run linter
npm run lint

# Preview production build locally
npm run preview
```

---

## Key Features & Routes

| Route | View | Description |
|---|---|---|
| `/` | **Dashboard** | Real-time telemetry metrics, open alerts, operational KPIs, and health status |
| `/live-demo` | **Live Threat Demo** | Deterministic 9-stage end-to-end SOC simulation with Safety Interlock and SHA-256 hash chaining |
| `/incidents` | **Incidents** | Severity-filtered incident queues and risk score rankings |
| `/incident/:id` | **Incident Detail** | Overview, interactive attack graph (`@xyflow/react`), AI investigation, and remediation tabs |
| `/approvals` | **Human Approvals** | Tier 0–3 governance queue with Approve, Reject, Override, Alternatives, and Escalate controls |
| `/rules` | **Trust & Rules** | AI trust score history, rule performance, and false positive tuning |
| `/evidence` | **Evidence & Audit** | Cryptographic audit trail registry with SHA-256 hash chain verification |
| `/settings` | **Settings** | LLM model routing, autonomy policy selection, and system diagnostics |
| `/login` | **Login** | Role-based authentication (Manager, Senior Analyst, Analyst) |

---

## Live Threat Response Demo Architecture

Located in `src/pages/LiveThreatSimulationPage.tsx` and `src/components/live-simulation/`, the Live Threat Response Demo provides an interactive 9-stage walkthrough:

1. **Event Generated**: Synthetic telemetry ingestion (`EVT-LIVE-001`).
2. **Event Processed**: Normalization and cross-signal correlation across Email, Identity, and Endpoint logs.
3. **Sigma Rule Detection**: Simulated Sigma rule match on `SOC-AUTH-001` (MITRE `T1566.002` / `T1078`).
4. **AI Evaluation**: Dual-path AI threat reasoning, 92% confidence score, and *Why Act vs. Why Wait* analysis.
5. **Incident Created**: Spawns `INC-LIVE-001` (Severity: High, Risk: 88/100).
6. **Response Recommended**: Playbook formulation (*"Revoke active sessions"*), highlighting that *AI Recommendation ≠ Execution*.
7. **Human Approval Required (Safety Interlock)**: Simulation automatically pauses and holds for analyst choice (`APPROVE`, `REJECT`, `OVERRIDE`, `ESCALATE`).
8. **Response Executed**: Simulated response actuation confirming containment.
9. **Audit Trail**: Dynamic WebCrypto SHA-256 hash-chained immutable audit records.

> **Prototype / Demo Disclaimer**: This frontend prototype contains simulated security telemetry, detection, AI evaluation, and response execution for demonstration purposes. The live threat simulation does not execute real containment actions against production infrastructure.
