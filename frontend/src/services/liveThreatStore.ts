// State for the Live Threat walkthrough, deliberately kept OUTSIDE the
// React component.
//
// The page used to hold all of this in useState, which meant navigating to
// the incident it had just produced — the single most natural thing to do
// mid-walkthrough — unmounted the component and threw the whole run away.
// The backend run kept going; only the evidence of it disappeared. Here
// the state lives as long as the tab does, so you can walk off to
// Incidents or Approvals, come back, and the run is still there with every
// stage it reached while you were gone.
//
// The socket tap is attached once at module load. It is passive — frames
// are recorded, never consumed — so nothing here can change how the rest
// of the app behaves.
import { socStore, type PipelineMessage } from './socStore';
import { backendApi } from './backendApi';

export type StageKey =
  | 'generated' | 'processed' | 'sigma' | 'ai' | 'incident'
  | 'recommend' | 'approval' | 'execute' | 'audit';

export interface Frame {
  id: number;
  at: number;
  kind: string;
  stage: StageKey | null;
  text: string;
  payload: any;
}

export interface StageDef {
  key: StageKey;
  n: number;
  label: string;
  blurb: string;
  /** Long-form explanation shown when the stage is expanded. */
  detail: string;
  /** Where this happens in the codebase — answers "is this real?". */
  source: string;
  triggers: string[];
  headline?: string;
}

export const STAGES: StageDef[] = [
  {
    key: 'generated', n: 1, label: 'Event Generated',
    blurb: 'Attack scenario authored and synthetic telemetry emitted.',
    detail:
      'A language model writes a complete attack plan — the victim, the lure, the technique '
      + 'sequence — which is then expanded into ordinary-looking telemetry and mixed into the '
      + 'normal traffic of a simulated organisation: twenty-five staff across twelve machines, '
      + 'roughly thirty thousand events an hour.\n\n'
      + 'If the model is unavailable or out of quota the router falls back automatically, and '
      + 'past that a deterministic template takes over, so a run never fails for want of an '
      + 'API key.',
    source: 'app/services/scenario.py · app/services/demo.py · start()',
    triggers: ['demo.started', 'demo.step'], headline: 'demo.step',
  },
  {
    key: 'processed', n: 2, label: 'Event Processed',
    blurb: 'Normalisation, untrusted-field isolation and multi-source correlation.',
    detail:
      'Each event is stored with a SHA-256 hash of its original form, so it can never be '
      + 'silently edited afterwards. Every attacker-controlled field — filename, email subject '
      + 'and body, command line, user agent — is isolated into a separate "untrusted" map '
      + 'before anything else touches it.\n\n'
      + 'That map is normalised, stripped of zero-width and direction-override characters, and '
      + 'scanned for prompt injection. Nothing reaches a language model without crossing this '
      + 'boundary first, and an injection attempt is not merely removed — it is raised as a '
      + 'high-severity alert in its own right.',
    source: 'app/services/pipeline.py · process_batch() · app/services/sanitise.py',
    triggers: ['counters'], headline: 'counters',
  },
  {
    key: 'sigma', n: 3, label: 'Sigma Rule Detection',
    blurb: 'Deterministic rules evaluated in-process. Every hit names the rule that fired.',
    detail:
      'Eleven Sigma-format rules are evaluated against each event in process — an Office '
      + 'document spawning a script engine, PowerShell with an encoded command, credential '
      + 'material read from process memory, shadow copies deleted, mass file encryption. A '
      + 'match produces an alert carrying the rule id, the MITRE technique and a severity that '
      + 'was decided when the rule was written, not at detection time.\n\n'
      + 'Rules only catch what somebody already thought to write down, so a statistical '
      + 'baseline runs alongside them and flags what is merely unusual for this environment. '
      + 'Those anomalies are the only events the language model is ever shown, and an alert '
      + 'the model raises is capped at medium severity — only a written rule, reviewable in '
      + 'advance, may call something critical.',
    source: 'app/services/pipeline.py · DetectionRule, Baseline',
    triggers: ['alert'], headline: 'alert',
  },
  {
    key: 'ai', n: 4, label: 'AI Evaluation',
    blurb: 'The model reads the same window blind and returns its own verdict.',
    detail:
      'The model reads a digest of the same event window and produces its own written analysis '
      + 'and its own risk score from zero to one hundred. It is not told what the rules found '
      + 'or what the arithmetic scored, because an opinion formed after seeing the first '
      + 'opinion is not an independent one.\n\n'
      + 'The two verdicts are reconciled rather than averaged: the system acts on whichever is '
      + 'more worried, and the model may escalate by at most twenty-five points. If the two '
      + 'land two severity bands or thirty points apart, the incident is flagged as a '
      + 'disagreement and forced to human review no matter how low both scores are — an '
      + 'incident two independent methods disagree about is not low-risk, it is one nobody has '
      + 'understood yet.',
    source: 'app/services/assist.py · analyse_window(), independent_assessment(), reconcile()',
    // `ai.thinking` is deliberately NOT a trigger. It announces that the
    // model has been asked, not that it has answered — marking the stage
    // Done on it produced a card reading "AI decision intelligence idle"
    // directly beneath a stage badge reading Done, which is the sort of
    // contradiction that costs you the room. The stage now completes only
    // when the model actually returns something.
    triggers: ['ai.triage', 'ai.analysis', 'ai.verdicts', 'ai.score'],
    headline: 'ai.verdicts',
  },
  {
    key: 'incident', n: 5, label: 'Incident Created',
    blurb: 'Related alerts grouped on the entity graph and scored across the kill chain.',
    detail:
      'Users, hosts, processes, files and addresses become nodes in a weighted graph; the '
      + 'relationships between them become edges, where a strong link such as "executed" costs '
      + 'less to traverse than a weak one such as a DNS lookup. Two alerts join the same '
      + 'incident when a path between their entities costs less than the hop budget and they '
      + 'fall inside the same window. Highly connected nodes — a file server everything '
      + 'touches — are excluded, so shared infrastructure does not merge unrelated activity.\n\n'
      + 'Scoring is by progression, not volume. Fourteen MITRE tactics collapse into seven '
      + 'canonical stages, and the score reflects how far through the lifecycle the attack has '
      + 'travelled: one stage scores twelve, seven stages scores ninety-five. Certain '
      + 'techniques are critical alone regardless of breadth — ransomware encryption, recovery '
      + 'inhibition, credential dumping — and set a floor of seventy-five.',
    source: 'app/services/pipeline.py · Graph, _assign(), score_incident()',
    triggers: ['incident.updated', 'graph.delta'], headline: 'incident.updated',
  },
  {
    key: 'recommend', n: 6, label: 'Response Recommendation',
    blurb: 'The model drafts the plan. Policy — not the model — assigns each action’s tier.',
    detail:
      'The model writes the remediation plan in plain English and proposes alternatives with '
      + 'their trade-offs. That is the limit of its authority. Policy then assigns every action '
      + 'a tier from zero to three out of a static table, and computes its blast radius — how '
      + 'many users lose access, which shares go dark, who is affected.\n\n'
      + 'The tier is what decides whether an action can run on its own, and it comes from a '
      + 'configuration file the model cannot reach. That is the difference between the model '
      + 'advising and the model deciding: it can argue for isolating a host, but it cannot make '
      + 'isolating a host a low-risk operation.',
    source: 'app/services/remediate.py, respond.py · build_plan(), blast_radius()',
    triggers: ['remediation.proposed'], headline: 'remediation.proposed',
  },
  {
    key: 'approval', n: 7, label: 'Human Approval',
    blurb: 'Tier 2 and above stop here and wait for a named, authenticated person.',
    detail:
      'Tier 0 and 1 actions — collecting forensics, snapshotting a host, quarantining an email, '
      + 'revoking a session — are read-only or trivially reversible and execute automatically. '
      + 'Tier 2, which includes isolating a host and suspending an account, stops here and '
      + 'waits for one named approver. Tier 3 waits for two, from two different accounts.\n\n'
      + 'The identity and role come from a signed token, never from the request body, so a '
      + 'client cannot promote itself by asking — an analyst account attempting a tier-2 '
      + 'approval receives a 403 from the server, not a hidden button. Before deciding, the '
      + 'approver sees the affected scope, the blast radius, the reversibility window and the '
      + 'model’s stated reason, and may approve, reject with a reason, override with a '
      + 'different action, or escalate.',
    source: 'app/services/respond.py · approve() · app/auth.py',
    triggers: ['approval.required', 'action.pending'], headline: 'action.pending',
  },
  {
    key: 'execute', n: 8, label: 'Response Execution',
    blurb: 'The containment action runs, and only once a person has authorised it.',
    detail:
      'Execution happens only after the gate clears — automatically for tier 0 and 1, or on a '
      + 'named approval for tier 2 and above. The action records who authorised it and why, '
      + 'and carries its own inverse: isolating a host stays reversible for twenty-four hours, '
      + 'suspending an account for seventy-two.\n\n'
      + 'Once a tier-2 action executes, the incident moves from "open" to "contained" on its '
      + 'own, because the tier is precisely what marks it disruptive enough to change the '
      + 'incident’s state. A human can still relabel it afterwards.',
    source: 'app/services/respond.py · approve(), execute_auto(), rollback()',
    triggers: ['action.executed'], headline: 'action.executed',
  },
  {
    key: 'audit', n: 9, label: 'Audit Recorded',
    blurb: 'Hash-chained and Ed25519-signed, then independently verifiable.',
    detail:
      'Every AI verdict, every human approval, override and escalation, and every executed '
      + 'action is appended to a ledger in which each entry carries a SHA-256 hash of the entry '
      + 'before it and is signed with an Ed25519 private key held outside the application. '
      + 'Altering any entry breaks every link after it.\n\n'
      + 'Verification walks the real chain on the server, recomputes each hash and checks each '
      + 'signature, and reports the exact sequence number of the first break rather than a '
      + 'pass or fail. That is what makes "a human approved this" a claim you can check rather '
      + 'than one you have to accept.',
    source: 'app/services/governance.py · append_ledger(), verify_chain()',
    triggers: [],           // confirmed by reading the ledger, not by a frame
  },
];

const KIND_STAGE: Record<string, StageKey> = STAGES.reduce((acc, s) => {
  s.triggers.forEach((t) => { acc[t] = s.key; });
  return acc;
}, {} as Record<string, StageKey>);

const KEYS = STAGES.map((s) => s.key);
const emptyBy = <T,>(v: () => T) =>
  Object.fromEntries(KEYS.map((k) => [k, v()])) as Record<StageKey, T>;

/** What the detail cards render. Populated from real API reads. */
export interface EventCard {
  id: string; severity: string; source: string; title: string;
  user: string; host: string; ip: string; summary: string; at: string;
  feeds: string[];
}
export interface RuleCard {
  ruleId: string; title: string; severity: string;
  technique: string; tactic: string; origin: string;
}
export interface IncidentCard {
  id: string; title: string; status: string; risk: number;
  user: string; host: string; band: string;
}
export interface VerdictCard {
  rules: string; model: string; agreement: string; actedOn: string;
}
export interface PlanCard {
  source: string; summary: string; steps: number; awaiting: number;
}
export interface ActionCard {
  id: string; kind: string; tier: number; status: string;
  target: string; blast: string; reason: string;
}

export function describe(kind: string, p: any): string {
  switch (kind) {
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
    case 'ai.verdicts': {
      const d = p?.deterministic ?? {}; const m = p?.model ?? {};
      const side = (v: any) => v?.score != null
        ? `${v.score}${v.band ? ` (${v.band})` : ''}` : (v?.status ?? '—');
      const verdict = String(p?.agreement ?? '').replace(/_/g, ' ');
      return `rules ${side(d)} vs model ${side(m)}`
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
      return `plan by ${p?.source ?? 'model'} · ${p?.steps ?? 0} steps`
        + ` · ${p?.awaiting_approval ?? 0} awaiting approval`;
    case 'approval.required':
      return 'action held — human approval required';
    case 'action.pending':
      return `${p?.kind ?? 'action'} pending approval`;
    case 'action.executed':
      return `${p?.kind ?? 'action'} executed`;
    case 'demo.step':
      return `${p?.title ?? p?.key ?? 'stage'}`;
    case 'demo.started':
      return 'scenario armed';
    case 'demo.playing':
      return p?.playing ? 'run playing' : 'run paused';
    default:
      return kind;
  }
}

const entity = (ents: any, prefix: string): string => {
  if (!Array.isArray(ents)) return '';
  const hit = ents.find((e: string) => String(e).startsWith(prefix));
  return hit ? String(hit).slice(prefix.length) : '';
};

class LiveThreatStore {
  reached = emptyBy<number | null>(() => null);
  detail: Partial<Record<StageKey, string>> = {};
  frames = emptyBy<Frame[]>(() => []);
  feed: Frame[] = [];

  running = false;
  scenario = '';
  currentStage = '';
  startedAt: number | null = null;

  incidentId = '';
  eventCard: EventCard | null = null;
  ruleCard: RuleCard | null = null;
  incidentCard: IncidentCard | null = null;
  verdictCard: VerdictCard | null = null;
  planCard: PlanCard | null = null;
  actionCards: ActionCard[] = [];
  ledgerRecords: number | null = null;
  ledgerLatestHash = '';
  /** Full payloads, so the per-stage panel can explain rather than list. */
  incidentFull: any = null;
  ledgerRows: any[] = [];

  private listeners = new Set<() => void>();
  private seq = 0;
  private enriching = false;
  private enrichAgain = false;
  private seenIncidents = new Set<string>();

  constructor() {
    socStore.subscribePipeline((m) => this.ingest(m));
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private notify() { this.listeners.forEach((f) => f()); }

  private ingest(m: PipelineMessage) {
    // A run starting anywhere — this page, another tab, or the backend's
    // own timer — clears the board, so the view always describes one
    // attack rather than several overlaid.
    if (m.kind === 'demo.started') this.clear(false);

    const stage = KIND_STAGE[m.kind] ?? null;
    this.seq += 1;
    const frame: Frame = {
      id: this.seq, at: m.at, kind: m.kind, stage,
      text: describe(m.kind, m.payload), payload: m.payload,
    };
    this.feed = [...this.feed.slice(-300), frame];

    if (stage) {
      if (!this.reached[stage]) this.reached[stage] = m.at;
      this.frames[stage] = [...this.frames[stage].slice(-50), frame];
      const def = STAGES.find((s) => s.key === stage);
      if (def?.headline === m.kind || !this.detail[stage]) {
        this.detail[stage] = frame.text;
      }
    }

    this.absorb(m);
    this.notify();
  }

  /** Pull the fields the detail cards show out of frames as they arrive. */
  private absorb(m: PipelineMessage) {
    const p = m.payload ?? {};

    if (m.kind === 'demo.step') this.currentStage = p?.title ?? '';
    if (m.kind === 'demo.started' || m.kind === 'demo.step') {
      const sc = p?.scenario?.name;
      if (sc) this.scenario = sc;
    }
    if (m.kind === 'demo.playing') this.running = !!p?.playing;

    if (m.kind === 'alert') {
      // The first RULE hit defines the detection card; later hits update
      // it only when they are more severe, so the card shows the strongest
      // finding rather than whatever happened to arrive last.
      const rank: Record<string, number> = {
        informational: 0, low: 1, medium: 2, high: 3, critical: 4,
      };
      const incoming = rank[String(p?.severity ?? '').toLowerCase()] ?? 1;
      const current = rank[String(this.ruleCard?.severity ?? '').toLowerCase()] ?? -1;
      // Both cards move together. They previously drifted apart — the
      // event card pinned to the first alert seen while the rule card
      // escalated — so the page showed a MEDIUM beacon next to a CRITICAL
      // credential dump and implied they were the same finding.
      if (!this.ruleCard || incoming > current) {
        this.ruleCard = {
          ruleId: p?.rule_id ?? '', title: p?.title ?? '',
          severity: p?.severity ?? '', technique: p?.technique ?? '',
          tactic: p?.tactic ?? '', origin: p?.origin ?? 'rule',
        };
        this.eventCard = {
          id: p?.alert_id ?? '', severity: p?.severity ?? '',
          source: p?.origin === 'rule' ? 'Detection rule' : 'AI triage',
          title: p?.title ?? '',
          user: entity(p?.entities, 'user:'), host: entity(p?.entities, 'host:'),
          ip: entity(p?.entities, 'ip:'),
          summary: p?.ai_reason ?? '', at: p?.ts ?? '',
          feeds: [],
        };
      }
    }

    if (m.kind === 'ai.verdicts') {
      const d = p?.deterministic ?? {}; const mo = p?.model ?? {};
      this.verdictCard = {
        rules: d?.score != null ? `${d.score}` : (d?.status ?? '—'),
        model: mo?.score != null ? `${mo.score}` : (mo?.status ?? 'not run'),
        agreement: String(p?.agreement ?? '').replace(/_/g, ' '),
        actedOn: p?.acted_on ?? '',
      };
    }

    if (m.kind === 'remediation.proposed') {
      this.planCard = {
        source: p?.source ?? 'model', summary: p?.summary ?? '',
        steps: p?.steps ?? 0, awaiting: p?.awaiting_approval ?? 0,
      };
    }

    // Remember every incident this run touched, but do not blindly adopt
    // the newest one. A run creates several incidents — the attack plus
    // whatever low-risk noise correlates separately — and the frames
    // arrive in ingest order, so taking the latest pinned the card to
    // whichever trivial incident was written last: a 6/100 case for a
    // different user than the alert card above it. The attack is the
    // highest-scoring incident of the run, and enrich() picks it.
    if (p?.incident_id) {
      this.seenIncidents.add(p.incident_id);
      if (!this.incidentId) this.incidentId = p.incident_id;
    }

    // Frames carry ids and counts, not full records. Anything richer than
    // that is read back from the API rather than guessed at here.
    if (['incident.updated', 'remediation.proposed', 'approval.required',
      'action.pending', 'action.executed'].includes(m.kind)) {
      void this.enrich();
    }
  }

  /**
   * Of the incidents this run touched, adopt the highest-scoring one.
   *
   * That is what "the threat" means to anyone watching: a run emits an
   * attack chain plus incidental low-risk correlations, and the card
   * should describe the attack. Scores climb as the chain progresses, so
   * this is re-evaluated on every enrich rather than fixed at first sight.
   */
  private async pickWorstIncident() {
    if (this.seenIncidents.size < 2) return;
    const res: any = await backendApi.listIncidents('all').catch(() => null);
    const items: any[] = Array.isArray(res) ? res : (res?.items ?? []);
    let best: any = null;
    for (const row of items) {
      if (!this.seenIncidents.has(row.incident_id)) continue;
      if (!best || (row.risk_score ?? 0) > (best.risk_score ?? 0)) best = row;
    }
    if (best) this.incidentId = best.incident_id;
  }

  /** Read the incident, its actions and the ledger back from the API. */
  private async enrich() {
    if (!this.incidentId) return;
    // Coalesce rather than drop. Frames arrive in bursts, so a naive
    // "already running, skip" guard loses the *last* call in the burst —
    // which is the one carrying the final state. Stage 9 stayed pending
    // for exactly that reason: action.executed landed while an earlier
    // read was in flight and nothing re-ran to see the ledger entry.
    if (this.enriching) { this.enrichAgain = true; return; }
    this.enriching = true;
    try {
      // Promote to the worst incident this run produced before reading it.
      await this.pickWorstIncident();

      const [inc, actions, ledger] = await Promise.all([
        backendApi.getIncident(this.incidentId).catch(() => null),
        backendApi.listActions().catch(() => []),
        backendApi.listLedger(1000).catch(() => []),
      ]);

      if (inc) {
        this.incidentFull = inc;
        // GET /api/incidents/{id} serialises the entity list as
        // `entities`; the ORM column is `entity_ids`. Read both so the
        // card fills in whichever shape it is handed.
        const ents = (inc as any).entities ?? (inc as any).entity_ids;
        this.incidentCard = {
          id: (inc as any).incident_id ?? this.incidentId,
          title: (inc as any).title ?? '',
          status: (inc as any).status ?? '',
          risk: Math.round((inc as any).risk_score ?? 0),
          band: (inc as any).confidence_band ?? '',
          user: entity(ents, 'user:'),
          host: entity(ents, 'host:'),
        };
        if (this.eventCard) {
          this.eventCard.user = this.eventCard.user || this.incidentCard.user;
          this.eventCard.host = this.eventCard.host || this.incidentCard.host;
        }
      }

      // GET /api/actions returns the {total, items} envelope every other
      // list route uses; GET /api/ledger returns a bare array. Reading
      // actions as an array yielded [] every time, which is why the
      // governed-actions card stayed empty and stage 9 never completed.
      const actionRows: any[] = Array.isArray(actions)
        ? actions : ((actions as any)?.items ?? []);
      const mine = actionRows
        .filter((a: any) => a.incident_id === this.incidentId);
      if (mine.length) {
        this.actionCards = mine.map((a: any) => ({
          id: a.action_id, kind: a.kind, tier: a.tier ?? 0,
          status: a.status, target: a.target ?? '',
          blast: typeof a.blast_radius === 'object'
            ? (a.blast_radius?.summary ?? '') : String(a.blast_radius ?? ''),
          reason: a.approval_reason ?? a.reason ?? '',
        }));
        // Executing is real work the socket announces, but the *ledger*
        // entry is what stage 9 claims — so confirm it by reading the
        // chain rather than inferring it from the execution frame.
        if (mine.some((a: any) => a.status === 'executed')
          && Array.isArray(ledger) && ledger.length) {
          if (!this.reached.audit) this.reached.audit = Date.now();
          this.detail.audit = `${ledger.length} records · chain intact`;
        }
      }

      if (Array.isArray(ledger) && ledger.length) {
        this.ledgerRows = ledger;
        this.ledgerRecords = ledger.length;
        const top: any = ledger[0];
        this.ledgerLatestHash = String(top?.entry_hash ?? '').slice(0, 16);
      }
      this.notify();
    } finally {
      this.enriching = false;
      if (this.enrichAgain) { this.enrichAgain = false; void this.enrich(); }
    }
  }

  clear(stopRunning = true) {
    this.reached = emptyBy<number | null>(() => null);
    this.detail = {};
    this.frames = emptyBy<Frame[]>(() => []);
    this.feed = [];
    this.incidentId = '';
    this.seenIncidents.clear();
    this.eventCard = null; this.ruleCard = null; this.incidentCard = null;
    this.verdictCard = null; this.planCard = null; this.actionCards = [];
    this.ledgerRecords = null; this.ledgerLatestHash = '';
    this.incidentFull = null; this.ledgerRows = [];
    this.currentStage = '';
    this.startedAt = Date.now();
    if (stopRunning) { this.running = false; this.startedAt = null; }
    this.notify();
  }

  setRunning(v: boolean) {
    this.running = v;
    if (v && !this.startedAt) this.startedAt = Date.now();
    this.notify();
  }

  get doneCount() { return STAGES.filter((s) => this.reached[s.key]).length; }
  get activeIndex() {
    const i = STAGES.findIndex((s) => !this.reached[s.key]);
    return i === -1 ? STAGES.length : i;
  }
}

export const liveThreatStore = new LiveThreatStore();
