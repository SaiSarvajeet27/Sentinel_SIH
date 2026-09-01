// State for the Live Threat walkthrough, deliberately kept OUTSIDE the
// React component.
//
// The page used to hold all of this in useState, which meant navigating to
// the incident it had just produced — the single most natural thing to do
// mid-demo — unmounted the component and threw the whole run away. The
// backend run kept going; only the evidence of it disappeared. Here the
// state lives for as long as the tab does, so you can walk off to
// Incidents or Approvals, come back, and the walkthrough is still there
// with every stage it reached while you were gone.
//
// The socket tap is attached once at module load. It is passive — frames
// are recorded, never consumed — so nothing here can change how the rest
// of the app behaves.
import { socStore, type PipelineMessage } from './socStore';

export type StageKey =
  | 'ingest' | 'detect' | 'ai' | 'incident' | 'respond' | 'approve' | 'audit';

export interface Frame {
  id: number;
  at: number;
  kind: string;
  stage: StageKey | null;
  text: string;
  /** The raw payload, so the detail panel can show what actually arrived. */
  payload: any;
}

export interface StageDef {
  key: StageKey;
  n: number;
  label: string;
  what: string;
  /** Long-form explanation shown when the stage is expanded. */
  detail: string;
  /** Where this happens in the codebase — answers "is this real?". */
  source: string;
  triggers: string[];
  headline?: string;
}

export const STAGES: StageDef[] = [
  {
    key: 'ingest', n: 1, label: 'Telemetry ingested',
    what: 'Raw events arrive from endpoint, identity, email and network sources.',
    detail:
      'The scenario generator writes a complete attack plan, which is then expanded into '
      + 'ordinary-looking telemetry and mixed into the normal traffic of a simulated '
      + 'organisation — twenty-five staff across twelve machines, roughly thirty thousand '
      + 'events an hour. Each event is stored with a SHA-256 hash of its original form, so '
      + 'it can never be silently edited afterwards.\n\n'
      + 'Critically, every attacker-controlled field — filename, email subject and body, '
      + 'command line, user agent — is isolated into a separate "untrusted" map before '
      + 'anything else touches it. That map is normalised, stripped of zero-width and '
      + 'direction-override characters, and scanned for prompt injection. Nothing reaches '
      + 'a language model without passing this boundary first.',
    source: 'app/services/pipeline.py · process_batch() · app/services/sanitise.py',
    triggers: ['counters'],
  },
  {
    key: 'detect', n: 2, label: 'Sigma rules evaluated',
    what: 'Deterministic detection rules run in-process. Every hit names the rule that fired.',
    detail:
      'Eleven Sigma-format rules are evaluated against each event in process — an Office '
      + 'document spawning a script engine, PowerShell with an encoded command, credential '
      + 'material read from process memory, shadow copies deleted, mass file encryption, and '
      + 'so on. A rule match produces an alert carrying the rule id, the MITRE technique, and '
      + 'a severity that was decided when the rule was written, not at detection time.\n\n'
      + 'Rules only catch what somebody already thought to write down, so a purely '
      + 'statistical baseline runs alongside them and flags what is merely unusual for this '
      + 'environment. Those anomalies are the only events the language model is ever shown, '
      + 'and an alert the model raises is capped at medium severity — only a written rule, '
      + 'reviewable in advance, may call something critical.',
    source: 'app/services/pipeline.py · DetectionRule, Baseline',
    triggers: ['alert'], headline: 'alert',
  },
  {
    key: 'ai', n: 3, label: 'AI second analyst',
    what: 'The model reviews the same window blind — it is never shown the rules’ verdict.',
    detail:
      'The model reads a digest of the same event window and produces its own written '
      + 'analysis and its own risk score, from zero to one hundred. It is not told what the '
      + 'rules found or what the arithmetic scored, because an opinion formed after seeing '
      + 'the first opinion is not an independent one.\n\n'
      + 'The two verdicts are then reconciled rather than averaged: the system acts on '
      + 'whichever is more worried, and the model may escalate by at most twenty-five points. '
      + 'If the two land two severity bands or thirty points apart, the incident is flagged '
      + 'as a disagreement and forced to human review no matter how low both scores are — an '
      + 'incident two independent methods disagree about is not low-risk, it is one nobody '
      + 'has understood yet.',
    source: 'app/services/assist.py · analyse_window(), independent_assessment(), reconcile()',
    triggers: ['ai.thinking', 'ai.triage', 'ai.analysis', 'ai.verdicts', 'ai.score'],
    headline: 'ai.verdicts',
  },
  {
    key: 'incident', n: 4, label: 'Correlated into an incident',
    what: 'Related alerts are grouped on the entity graph and scored across the kill chain.',
    detail:
      'Users, hosts, processes, files and addresses become nodes in a weighted graph; the '
      + 'relationships between them become edges, where a strong link such as "executed" or '
      + '"logged into" costs less to traverse than a weak one such as a DNS lookup. Two '
      + 'alerts join the same incident when a path between their entities costs less than '
      + 'the hop budget and they fall inside the same time window. Highly connected nodes — '
      + 'a file server everything touches — are excluded, so shared infrastructure does not '
      + 'merge unrelated activity into one case.\n\n'
      + 'Scoring is by progression, not volume. Fourteen MITRE tactics collapse into seven '
      + 'canonical stages, and the score reflects how far through the lifecycle the attack '
      + 'has travelled: one stage scores twelve, seven stages scores ninety-five. Certain '
      + 'techniques are critical on their own regardless of breadth — ransomware encryption, '
      + 'recovery inhibition, credential dumping — and set a floor of seventy-five.',
    source: 'app/services/pipeline.py · Graph, _assign(), score_incident()',
    triggers: ['incident.updated', 'graph.delta'], headline: 'incident.updated',
  },
  {
    key: 'respond', n: 5, label: 'Response proposed',
    what: 'The AI drafts the remediation plan. Policy — not the model — assigns each action’s tier.',
    detail:
      'The model writes the remediation plan in plain English and proposes alternatives with '
      + 'their trade-offs. That is the limit of its authority. Policy then assigns every '
      + 'action a tier from zero to three from a static table, and computes its blast radius '
      + '— how many users lose access, which shares go dark, who is affected.\n\n'
      + 'The tier is what decides whether the action can run on its own, and it comes from a '
      + 'configuration file the model cannot reach. This is the difference between the model '
      + 'advising and the model deciding: it can argue for isolating a host, but it cannot '
      + 'make isolating a host a low-risk operation.',
    source: 'app/services/remediate.py, respond.py · build_plan(), blast_radius()',
    triggers: ['remediation.proposed'],
  },
  {
    key: 'approve', n: 6, label: 'Held for human approval',
    what: 'Tier 2 and above stop here and wait for a named, authenticated person.',
    detail:
      'Tier 0 and 1 actions — collecting forensics, snapshotting a host, quarantining an '
      + 'email, revoking a session — are read-only or trivially reversible, and execute '
      + 'automatically. Tier 2, which includes isolating a host and suspending an account, '
      + 'stops here and waits for one named approver. Tier 3 waits for two, from two '
      + 'different accounts.\n\n'
      + 'The identity and role come from a signed token, never from the request body, so a '
      + 'client cannot promote itself by asking — an analyst account attempting a tier-2 '
      + 'approval receives a 403 from the server, not a hidden button. Before deciding, the '
      + 'approver sees the affected scope, the blast radius, the reversibility window and '
      + 'the model’s stated reason, and may approve, reject with a reason, override with a '
      + 'different action, or escalate.',
    source: 'app/services/respond.py · approve() · app/auth.py',
    triggers: ['approval.required', 'action.pending'], headline: 'action.pending',
  },
  {
    key: 'audit', n: 7, label: 'Written to the signed ledger',
    what: 'The decision is hash-chained and Ed25519-signed, then independently verifiable.',
    detail:
      'Every AI verdict, every human approval, override and escalation, and every executed '
      + 'action is appended to a ledger in which each entry carries a SHA-256 hash of the '
      + 'entry before it, and is signed with an Ed25519 private key held outside the '
      + 'application. Altering any entry breaks every link after it.\n\n'
      + 'Verification walks the real chain on the server, recomputes each hash and checks '
      + 'each signature, and reports the exact sequence number of the first break rather '
      + 'than a pass/fail. This is what makes "a human approved this" a claim you can check '
      + 'rather than one you have to accept.',
    source: 'app/services/governance.py · append_ledger(), verify_chain()',
    triggers: ['action.executed'],
  },
];

const KIND_STAGE: Record<string, StageKey> = STAGES.reduce((acc, s) => {
  s.triggers.forEach((t) => { acc[t] = s.key; });
  return acc;
}, {} as Record<string, StageKey>);

const EMPTY_REACHED = (): Record<StageKey, number | null> => ({
  ingest: null, detect: null, ai: null, incident: null,
  respond: null, approve: null, audit: null,
});
const EMPTY_FRAMES = (): Record<StageKey, Frame[]> => ({
  ingest: [], detect: [], ai: [], incident: [],
  respond: [], approve: [], audit: [],
});

/** Turn one socket frame into a line a person can read. */
export function describe(kind: string, p: any): string {
  switch (kind) {
    // Keys per Counters.snapshot() in app/db.py — events_processed, not events.
    case 'counters':
      return `events ${Number(p?.events_processed ?? 0).toLocaleString()}`
        + ` · alerts ${p?.alerts_raised ?? 0}`
        + ` · incidents ${p?.incidents_open ?? 0}`
        + ` · injections blocked ${p?.injections_blocked ?? 0}`;
    case 'alert':
      return `${p?.origin === 'rule' ? 'RULE' : 'AI'} · ${p?.title ?? 'alert'}`
        + ` · ${p?.technique ?? ''} · ${String(p?.severity ?? '').toUpperCase()}`;
    case 'alert.flood':
      return 'alert flood detected — rate far above baseline';
    case 'ai.thinking':
      return `model working: ${p?.task ?? p?.message ?? 'analysing'}`;
    case 'ai.triage':
      return `triage reviewed ${p?.reviewed ?? '?'} anomalies, raised ${p?.raised ?? 0}`;
    case 'ai.analysis':
      return `independent analysis complete${p?.findings != null ? ` · ${p.findings} findings` : ''}`;
    // agreement_detail (assist.py) nests each verdict as {score, band}.
    case 'ai.verdicts': {
      const d = p?.deterministic ?? {};
      const m = p?.model ?? {};
      const side = (v: any, fallback: any) =>
        v?.score != null ? `${v.score}${v.band ? ` (${v.band})` : ''}`
          : (v?.status ?? fallback ?? '—');
      const verdict = String(p?.agreement ?? '').replace(/_/g, ' ');
      return `rules ${side(d, p?.rules_score)} vs model ${side(m, p?.ai_score)}`
        + (verdict ? ` · ${verdict}` : '')
        + (p?.acted_on ? ` · acted on ${p.acted_on}` : '');
    }
    case 'ai.score':
      return `score adjustment proposed: ${p?.delta ?? '?'}`;
    case 'incident.updated':
      return `incident ${String(p?.incident_id ?? '').slice(0, 18)}… risk ${p?.risk ?? p?.status ?? ''}`;
    case 'graph.delta':
      return `entity graph grew by ${Array.isArray(p?.deltas) ? p.deltas.length : 0} relationships`;
    case 'remediation.proposed':
      return `plan drafted by ${p?.source ?? 'model'} · ${p?.steps ?? 0} steps`
        + ` · ${p?.awaiting_approval ?? 0} awaiting approval`;
    case 'approval.required':
      return 'action held — human approval required';
    case 'action.pending':
      return `${p?.kind ?? 'action'} pending approval`;
    case 'action.executed':
      return `${p?.kind ?? 'action'} executed and written to the ledger`;
    case 'demo.step':
      return `stage: ${p?.title ?? p?.key ?? ''}`;
    case 'demo.started':
      return 'new scenario armed';
    case 'demo.playing':
      return 'run playing';
    default:
      return kind;
  }
}

class LiveThreatStore {
  reached = EMPTY_REACHED();
  detail: Partial<Record<StageKey, string>> = {};
  frames = EMPTY_FRAMES();
  feed: Frame[] = [];
  incidentId = '';
  running = false;
  startedAt: number | null = null;

  private listeners = new Set<() => void>();
  private seq = 0;

  constructor() {
    socStore.subscribePipeline((m) => this.ingest(m));
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() { this.listeners.forEach((f) => f()); }

  private ingest(m: PipelineMessage) {
    const stage = KIND_STAGE[m.kind] ?? null;
    this.seq += 1;
    const frame: Frame = {
      id: this.seq, at: m.at, kind: m.kind, stage,
      text: describe(m.kind, m.payload), payload: m.payload,
    };

    // A run starting anywhere — this page, another tab, or the backend's
    // own 15-minute timer — resets the board, so the view always describes
    // one attack rather than several overlaid.
    if (m.kind === 'demo.started') this.clear(false);

    this.feed = [...this.feed.slice(-240), frame];

    if (stage) {
      if (!this.reached[stage]) this.reached[stage] = m.at;
      // Cap per-stage history: a long run emits hundreds of counters
      // frames and the detail panel only needs a readable sample.
      this.frames[stage] = [...this.frames[stage].slice(-40), frame];

      const def = STAGES.find((s) => s.key === stage);
      // A headline frame always wins; anything else only fills a blank, so
      // a late low-value frame cannot bury the informative one.
      if (def?.headline === m.kind || !this.detail[stage]) {
        this.detail[stage] = frame.text;
      }
    }
    if (m.payload?.incident_id) this.incidentId = m.payload.incident_id;
    this.notify();
  }

  /** Wipe the board. `stopRunning` false is used when a new run begins. */
  clear(stopRunning = true) {
    this.reached = EMPTY_REACHED();
    this.detail = {};
    this.frames = EMPTY_FRAMES();
    this.feed = [];
    this.incidentId = '';
    this.startedAt = Date.now();
    if (stopRunning) { this.running = false; this.startedAt = null; }
    this.notify();
  }

  setRunning(v: boolean) { this.running = v; this.notify(); }

  get doneCount() { return STAGES.filter((s) => this.reached[s.key]).length; }

  /** Index of the stage currently in flight, or STAGES.length when done. */
  get activeIndex() {
    const i = STAGES.findIndex((s) => !this.reached[s.key]);
    return i === -1 ? STAGES.length : i;
  }
}

export const liveThreatStore = new LiveThreatStore();
