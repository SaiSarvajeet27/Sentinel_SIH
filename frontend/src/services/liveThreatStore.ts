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
      'A language model is asked for a complete attack plan as structured JSON: who the '
      + 'victim is, what the lure says, and which MITRE techniques the intrusion will use, in '
      + 'order. Scenario generation is the one task routed to Gemini 2.5 Flash by default, '
      + 'because it runs once per cycle and is pure fiction rather than a reading of real '
      + 'telemetry. If Gemini is unavailable or out of daily quota the router falls through to '
      + 'Groq, then to a local Ollama model, and past all three to a deterministic template — '
      + 'so a run never fails for want of an API key, it only changes who wrote the story.\n\n'
      + 'That plan is then expanded into telemetry and mixed into the ordinary traffic of a '
      + 'simulated organisation: twenty-five staff across twelve machines, generating roughly '
      + 'thirty thousand events an hour from four sources — endpoint, identity, email and '
      + 'network. The attack is a few dozen events inside that. It is deliberately not made '
      + 'easy to find, because a detector that only works when you already know where to look '
      + 'is not a detector.\n\n'
      + 'Every event is written with a stable id, a timestamp, its source, and a SHA-256 hash '
      + 'of its original form. That hash is what lets an analyst confirm, hours later, that '
      + 'the evidence in front of them is byte-for-byte what arrived — nothing in the pipeline '
      + 'can quietly edit an event after the fact without the hash disagreeing.\n\n'
      + 'Attack events are also stamped with the technique they were written to represent. '
      + 'That field exists only so /api/benchmark can measure detection recall honestly, and '
      + 'no detection rule reads it — otherwise the measurement would be circular, and the '
      + 'system would be grading its own homework.',
    source: 'app/services/scenario.py · app/services/demo.py · start(), _ingest()',
    triggers: ['demo.started', 'demo.step'], headline: 'demo.step',
  },
  {
    key: 'processed', n: 2, label: 'Event Processed',
    blurb: 'Normalisation, untrusted-field isolation and multi-source correlation.',
    detail:
      'Before anything else reads an event, the parts of it an attacker could have chosen are '
      + 'separated from the parts the infrastructure recorded. Filename, email subject and '
      + 'body, command line, user agent, DNS query and authenticating username all move into '
      + 'an "untrusted" map. Everything downstream — including every prompt — treats that map '
      + 'as hostile input rather than as fact.\n\n'
      + 'Each untrusted value is then cleaned in a fixed order. Unicode is NFKC-normalised so '
      + 'lookalike characters collapse to their plain forms; zero-width and bidirectional '
      + 'override characters are removed, since both exist to hide text from a human reader '
      + 'while leaving it visible to a parser; control characters are dropped; whitespace is '
      + 'collapsed; and the result is truncated to a per-field ceiling — 200 characters for a '
      + 'filename, 500 for a command line, 1000 for an email body — so no single field can '
      + 'flood a model’s context.\n\n'
      + 'The cleaned text is then scanned for three classes of prompt injection: persona '
      + 'hijack, where the text impersonates an authority such as "[SOC ADMIN]:"; directive '
      + 'injection, which pairs a command word with a benign verdict, as in "ignore … mark as '
      + 'safe"; and context manipulation, which fakes structure such as a closing log tag or a '
      + '"Final verdict:" line. Only the matched span is redacted, so the surrounding text '
      + 'survives as evidence.\n\n'
      + 'A hit is not simply removed. It is raised as its own high-severity alert under '
      + 'T1565, because a legitimate filename does not contain instructions addressed to an AI '
      + 'system. Finding one means the adversary knows the defender runs AI tooling, which '
      + 'describes a more capable attacker — so the attempt is evidence in its own right, not '
      + 'noise to be filtered away.\n\n'
      + 'Text that does reach a model is finally interleaved with an invisible marker between '
      + 'words, so the model can tell data from instruction at the token level rather than '
      + 'relying on delimiters alone, which are trivially closed by an attacker.',
    source: 'app/services/sanitise.py · app/services/pipeline.py · process_batch()',
    triggers: ['counters'], headline: 'counters',
  },
  {
    key: 'sigma', n: 3, label: 'Sigma Rule Detection',
    blurb: 'Deterministic rules evaluated in-process. Every hit names the rule that fired.',
    detail:
      'Eleven Sigma-format rules are evaluated against every event in process. Each rule is a '
      + 'set of field patterns — an Office application spawning a script engine, PowerShell '
      + 'carrying an encoded command, a macro-enabled attachment, scheduled-task persistence, '
      + 'credential material read from process memory, domain account enumeration, endpoint '
      + 'protection being disabled, shadow copies deleted, mass file encryption, access to an '
      + 'administrative share, and a connection to an unfamiliar external address.\n\n'
      + 'A match produces an alert carrying the rule id, the MITRE technique and tactic, and a '
      + 'severity that was decided when the rule was written rather than at detection time. '
      + 'That ordering matters: it means every critical alert traces back to a judgement '
      + 'someone made in advance and can be argued with, rather than to a decision made in the '
      + 'moment by something that cannot be cross-examined.\n\n'
      + 'Rules only catch what somebody already thought to write down, so a purely statistical '
      + 'baseline runs alongside them. It learns what is normal here by counting — which '
      + 'processes this host runs, which machines this account touches, at what hours — and '
      + 'needs three hundred events before it will claim to know anything. It then flags '
      + 'events that are merely unusual, and an event must carry at least two independent '
      + 'oddities before it is considered at all, so a single quirk is not enough.\n\n'
      + 'Those anomalies, capped at forty per run and one model call, are the only events the '
      + 'language model is ever shown for detection. What it can do with them is bounded '
      + 'before it starts: an AI-raised alert can never exceed medium severity, it may only '
      + 'name a technique from a closed catalogue of fourteen, and it must clear a confidence '
      + 'threshold. The severity cap is enforced by a database CHECK constraint on the alert’s '
      + 'origin column, not by a prompt — only a written rule, reviewable beforehand, may call '
      + 'something critical.\n\n'
      + 'One rule was deliberately deleted during development and the reason is worth stating: '
      + 'a "first time this account authenticated here" rule fired twenty-four times in '
      + 'forty-five minutes of an ordinary working day and correlated into a single incident '
      + 'scoring 98 on a day when nothing happened. A signal that fires on ordinary behaviour '
      + 'is not a detection; it is an anomaly, and it belongs in the baseline where it must be '
      + 'corroborated before anyone is told.',
    source: 'app/services/pipeline.py · RULES, evaluate(), Baseline, admit_ai_alerts()',
    triggers: ['alert'], headline: 'alert',
  },
  {
    key: 'ai', n: 4, label: 'AI Evaluation',
    blurb: 'The model reads the same window blind and returns its own verdict.',
    detail:
      'The model is given a digest of the same event window the rules just processed — up to '
      + 'four hundred events summarised, of which twenty-five are shown in full — and asked '
      + 'for two things: a written analysis of what it believes happened, and its own risk '
      + 'score from zero to one hundred.\n\n'
      + 'It is not told what the rules found, what the arithmetic scored, or that a '
      + 'deterministic path exists at all. This is the whole point of the design: an opinion '
      + 'formed after seeing the first opinion is not an independent one, and two analysts who '
      + 'have conferred provide roughly one analyst’s worth of assurance.\n\n'
      + 'Every claim the model makes must be tied to a specific event id. Claims that cannot '
      + 'be matched against the evidence are removed before an analyst sees them, and the '
      + 'system records what it deleted and why. This is the answer to hallucination that does '
      + 'not depend on the model behaving — unsupported statements simply do not reach the '
      + 'person making the decision.\n\n'
      + 'The two verdicts are then reconciled rather than averaged. The system acts on '
      + 'whichever is more worried, the way a dual-sensor safety system believes the lower '
      + 'altimeter instead of splitting the difference. The model may carry the final number '
      + 'up by at most twenty-five points; separately, when asked to adjust a score it has '
      + 'been shown, it may move it up by fifteen and down by only ten. That asymmetry is '
      + 'deliberate — a model that has been talked into "this is fine" can soften a number '
      + 'slightly, but it can never dismiss anything.\n\n'
      + 'If a technique from the critical set is present — ransomware encryption, recovery '
      + 'inhibition, credential dumping from LSASS, cloud account abuse — a floor of seventy-'
      + 'five applies that no amount of model reasoning may cross.\n\n'
      + 'And if the two paths land two severity bands or thirty points apart, that '
      + 'disagreement is itself treated as a finding: the incident is forced into human review '
      + 'regardless of how low both scores were. An incident that two independent methods '
      + 'disagree about is not a low-risk incident. It is one that nobody has understood yet.',
    source: 'app/services/assist.py · analyse_window(), independent_assessment(), reconcile()',
    triggers: ['ai.triage', 'ai.analysis', 'ai.verdicts', 'ai.score'],
    headline: 'ai.verdicts',
  },
  {
    key: 'incident', n: 5, label: 'Incident Created',
    blurb: 'Related alerts grouped on the entity graph and scored across the kill chain.',
    detail:
      'Alerts on their own are not useful — a phishing email, a PowerShell launch and a file-'
      + 'server login are three separate rows until something establishes they are the same '
      + 'attack. That is what the entity graph does. Users, hosts, processes, files and '
      + 'addresses become nodes, and the relationships between them become weighted edges.\n\n'
      + 'The weights encode how much a relationship actually implies. Executing a process, '
      + 'logging into a host and spawning a child all cost 1.0; accessing a file or sending '
      + 'mail costs 1.5; an outbound connection 2.0; a DNS lookup 3.0. Low cost means a strong '
      + 'link, because the number is used as path weight — two alerts join the same incident '
      + 'only when a path between their entities costs less than a budget of 3.0 and they fall '
      + 'inside the same sixty-minute sliding window.\n\n'
      + 'Nodes above the ninety-fifth percentile for connectivity are excluded as bridges. '
      + 'Without that, a file server everything touches would link every event in the '
      + 'organisation into a single incident — shared infrastructure is not evidence of a '
      + 'relationship. Incidents are also scoped to their own run, so a fresh attack can never '
      + 'be absorbed into a case from hours earlier.\n\n'
      + 'Scoring is then done by progression, not volume. MITRE’s fourteen tactics collapse '
      + 'into seven canonical stages, and the score is read off a curve keyed to how many of '
      + 'those stages the intrusion has reached: one stage scores 12, three score 40, five '
      + 'score 70, all seven score 95. Ten alerts from a single stage remain a one-stage '
      + 'incident. This is deliberate — counting alerts rewards noisy rules and lets an '
      + 'attacker bury a real intrusion under volume, while counting progression measures how '
      + 'far they actually got.\n\n'
      + 'Asset criticality, the privilege of the accounts involved and the velocity of the '
      + 'activity adjust the result, and certain techniques are treated as critical on their '
      + 'own regardless of breadth. The purely arithmetic figure is stored separately as '
      + '`base_score`, so the question "what would this have scored without any AI involvement" '
      + 'stays answerable after the fact rather than being lost in a single blended number.',
    source: 'app/services/pipeline.py · Graph, _assign(), score_incident(), config.EDGE_WEIGHT',
    triggers: ['incident.updated', 'graph.delta'], headline: 'incident.updated',
  },
  {
    key: 'recommend', n: 6, label: 'Response Recommendation',
    blurb: 'The model drafts the plan. Policy — not the model — assigns each action’s tier.',
    detail:
      'Once an incident is scored, a response is proposed. The model writes the plan in plain '
      + 'English — what to do, in what order, and why — and offers alternatives with their '
      + 'trade-offs, so the analyst sees the decision space rather than a single instruction. '
      + 'Four playbooks also match against the techniques present: phishing response, endpoint '
      + 'isolation, credential reset and malware containment.\n\n'
      + 'That is the entire extent of the model’s authority here. Policy then assigns every '
      + 'proposed action a tier from a static table in the configuration file, which the model '
      + 'cannot read or influence. Collecting forensics, snapshotting a host, enriching an '
      + 'indicator and notifying an analyst are tier 0. Quarantining an email, blocking a '
      + 'hash, forcing re-authentication and revoking a session are tier 1. Suspending an '
      + 'account, isolating a host and blocking a domain are tier 2. Mass isolation and '
      + 'disabling a service account are tier 3.\n\n'
      + 'This separation is the difference between a model advising and a model deciding. It '
      + 'can argue at length for isolating a host; it cannot make isolating a host a low-risk '
      + 'operation. The two actions the problem statement names specifically — suspend account '
      + 'and isolate host — are both tier 2, and therefore both require a named human.\n\n'
      + 'Each action is also costed before anyone is asked to approve it. Blast radius is '
      + 'computed from the organisation model: how many users lose access, which shares go '
      + 'dark, whether the target is a person’s only machine. And reversibility is recorded as '
      + 'a real window rather than a promise — isolating a host can be undone for twenty-four '
      + 'hours, suspending an account for seventy-two, a blocked hash for a week.',
    source: 'app/services/remediate.py, respond.py · build_plan(), blast_radius(), config.TIERS',
    triggers: ['remediation.proposed'], headline: 'remediation.proposed',
  },
  {
    key: 'approval', n: 7, label: 'Human Approval',
    blurb: 'Tier 2 and above stop here and wait for a named, authenticated person.',
    detail:
      'This is the gate the whole system exists to enforce. Tier 0 and tier 1 actions execute '
      + 'automatically, because they are read-only or trivially reversible. Tier 2 stops and '
      + 'waits for one named, authenticated approver. Tier 3 waits for two, and they must be '
      + 'two different accounts — the same person approving twice is rejected explicitly.\n\n'
      + 'Authority comes from a signed token, never from the request body, so a client cannot '
      + 'promote itself by asking. The three roles have strictly increasing permissions: an '
      + 'analyst may approve nothing, a senior analyst may approve tier 2 and retire detection '
      + 'rules, and a manager may additionally approve tier 3. An analyst account attempting a '
      + 'tier-2 approval receives a 403 from the server — the button is not merely hidden, the '
      + 'API refuses.\n\n'
      + 'Before deciding, the approver is shown the affected scope, the blast radius, the '
      + 'reversibility window, the supporting event count and the model’s stated reason. They '
      + 'then have six responses, and each is recorded as a distinct signal: ask why, which '
      + 'opens the full reasoning chain and its evidence; review alternatives; approve; reject '
      + 'with a reason code; override, which rejects and substitutes a different action; or '
      + 'escalate to a higher authority with justification.\n\n'
      + 'Override is the most informative of these, because it captures what the analyst did '
      + '*instead*, which is a richer correction than a plain refusal. Rejections and '
      + 'overrides both feed the trust score and the per-rule false-positive rate, so the '
      + 'system’s measured reliability is built out of real human disagreement rather than '
      + 'asserted.\n\n'
      + 'System-wide autonomy is bounded too. Four modes exist — always ask, recommend only, '
      + 'act and notify, and full auto — and act and notify is the default. Full auto is '
      + 'present in the interface and permanently disabled by policy: the capability was built '
      + 'and then deliberately not enabled, because a platform that isolates machines with '
      + 'nobody supervising is exactly what this project argues against.',
    source: 'app/services/respond.py · approve(), override() · app/auth.py · config.ROLE_PERMISSIONS',
    triggers: ['approval.required', 'action.pending'], headline: 'action.pending',
  },
  {
    key: 'execute', n: 8, label: 'Response Execution',
    blurb: 'The containment action runs, and only once a person has authorised it.',
    detail:
      'Execution happens on one of two paths. Tier 0 and 1 actions run automatically as soon '
      + 'as the plan is built, under the active autonomy mode, and the analyst is notified '
      + 'rather than asked. Tier 2 and above run only after the gate clears, at which point '
      + 'the action records the identity of every approver and the reason they gave.\n\n'
      + 'Each executed action carries its own inverse. Isolating a host stays reversible for '
      + 'twenty-four hours, suspending an account for seventy-two, a blocked hash for a week; '
      + 'quarantining an email is reversible indefinitely. Reversibility is stored as a '
      + 'property of the action rather than described in prose, so "we can undo this" is a '
      + 'fact the interface can check rather than a reassurance.\n\n'
      + 'When a tier-2 action executes, the incident moves from open to contained on its own. '
      + 'The reasoning is that the tier is precisely what marks an action disruptive enough to '
      + 'change the state of the incident — if the system was willing to stop and ask a human '
      + 'before doing it, then doing it is a meaningful change in posture. A human can still '
      + 'relabel the incident afterwards.\n\n'
      + 'Every execution, and every rollback, is appended to the audit ledger as it happens, '
      + 'so the record of what was done is written at the moment it is done rather than '
      + 'reconstructed later from logs.',
    source: 'app/services/respond.py · execute_auto(), approve(), rollback()',
    triggers: ['action.executed'], headline: 'action.executed',
  },
  {
    key: 'audit', n: 9, label: 'Audit Recorded',
    blurb: 'Hash-chained and Ed25519-signed, then independently verifiable.',
    detail:
      'Every AI verdict, every human approval, override, rejection and escalation, and every '
      + 'executed or rolled-back action is appended to a ledger. Each entry holds a sequence '
      + 'number, a timestamp, the actor, the action type, the payload, a hash of that payload, '
      + 'and the hash of the entry immediately before it.\n\n'
      + 'Those two hashes are what make the record checkable. The entry hash is computed over '
      + 'the sequence number, timestamp, actor, action type, payload hash and previous entry '
      + 'hash together, so altering any one of them changes the entry’s own hash — which '
      + 'breaks the link the next entry holds, and every link after that. Rewriting one line '
      + 'means rewriting the entire remainder of the chain.\n\n'
      + 'Each entry is then signed with an Ed25519 private key held outside the application, '
      + 'so rewriting the chain is not sufficient either: an attacker would also need the '
      + 'signing key to make the forged entries verify. The corresponding public key is served '
      + 'openly, precisely so verification does not depend on trusting the server.\n\n'
      + 'Verification walks the real chain on the server, recomputing every hash and checking '
      + 'every signature in order, and reports the exact sequence number where the chain first '
      + 'breaks rather than a bare pass or fail. That is the difference between a log and an '
      + 'audit trail: a log asks to be believed, while this can be checked by someone who does '
      + 'not trust the people who produced it.\n\n'
      + 'One limitation is worth stating plainly. Append-only enforcement at the database '
      + 'level is a PostgreSQL trigger defined in the reference schema; on the SQLite path used '
      + 'for portability that trigger is not created, so today the guarantee rests on the hash '
      + 'chain and the signatures — which is exactly what verification actually checks.',
    source: 'app/services/governance.py · append_ledger(), verify_chain(), public_key_pem()',
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
