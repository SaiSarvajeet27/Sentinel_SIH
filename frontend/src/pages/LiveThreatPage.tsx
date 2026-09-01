// Live Threat — the judge-facing view of the pipeline.
//
// Everything here is an observer. The page starts the same backend run the
// rest of the app uses (POST /api/demo/start + /play) and then renders the
// WebSocket frames as they arrive; it does not simulate a single stage, and
// it holds no timers that advance the flow on their own. If the backend
// stalls, this page stalls with it — which is the point, because a
// walkthrough that animates regardless of what the server did would prove
// nothing to the person watching it.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  Activity, ShieldAlert, Cpu, GitMerge, Zap, UserCheck, FileLock2,
  Play, RotateCcw, ArrowRight, CheckCircle2, Loader2, Radio,
} from 'lucide-react';
import { useSOC } from '../components/common/SOCContext';
import { socStore, type PipelineMessage } from '../services/socStore';
import { backendApi } from '../services/backendApi';

type StageKey = 'ingest' | 'detect' | 'ai' | 'incident' | 'respond' | 'approve' | 'audit';

interface StageDef {
  key: StageKey;
  n: number;
  label: string;
  what: string;
  icon: React.ElementType;
  /** Socket kinds that mean this stage has actually happened. */
  triggers: string[];
  /**
   * The kind whose text should win the one-line summary. Several stages
   * receive a burst of frames and the last one to arrive is rarely the
   * most informative — graph.delta lands after incident.updated, so
   * without this the incident's risk score is overwritten by an edge
   * count. Any other trigger only fills the line while it is still empty.
   */
  headline?: string;
}

// The seven stages, in the order the backend produces them. `triggers` are
// the real socket kinds published by app/services/pipeline.py and demo.py —
// not a script this page plays back.
const STAGES: StageDef[] = [
  {
    key: 'ingest', n: 1, label: 'Telemetry ingested', icon: Activity,
    what: 'Raw events arrive from endpoint, identity, email and network sources.',
    triggers: ['counters'],
  },
  {
    key: 'detect', n: 2, label: 'Sigma rules evaluated', icon: ShieldAlert,
    what: 'Deterministic detection rules run in-process. Every hit names the rule that fired.',
    triggers: ['alert'], headline: 'alert',
  },
  {
    key: 'ai', n: 3, label: 'AI second analyst', icon: Cpu,
    what: 'The model reviews the same window blind — it is never shown the rules’ verdict.',
    triggers: ['ai.thinking', 'ai.triage', 'ai.analysis', 'ai.verdicts', 'ai.score'],
    headline: 'ai.verdicts',
  },
  {
    key: 'incident', n: 4, label: 'Correlated into an incident', icon: GitMerge,
    what: 'Related alerts are grouped on the entity graph and scored across the kill chain.',
    triggers: ['incident.updated', 'graph.delta'], headline: 'incident.updated',
  },
  {
    key: 'respond', n: 5, label: 'Response proposed', icon: Zap,
    what: 'The AI drafts the remediation plan. Policy — not the model — assigns each action’s tier.',
    triggers: ['remediation.proposed'],
  },
  {
    key: 'approve', n: 6, label: 'Held for human approval', icon: UserCheck,
    what: 'Tier 2 and above stop here and wait for a named, authenticated person.',
    triggers: ['approval.required', 'action.pending'], headline: 'action.pending',
  },
  {
    key: 'audit', n: 7, label: 'Written to the signed ledger', icon: FileLock2,
    what: 'The decision is hash-chained and Ed25519-signed, then independently verifiable.',
    triggers: ['action.executed'],
  },
];

const KIND_STAGE: Record<string, StageKey> = STAGES.reduce((acc, s) => {
  s.triggers.forEach((t) => { acc[t] = s.key; });
  return acc;
}, {} as Record<string, StageKey>);

interface FeedItem {
  id: number;
  at: number;
  kind: string;
  stage: StageKey | null;
  text: string;
}

/** Turn one socket frame into a line a person can read. */
function describe(kind: string, p: any): string {
  switch (kind) {
    // Keys per Counters.snapshot() in app/db.py — events_processed, not events.
    case 'counters':
      return `events ${Number(p?.events_processed ?? 0).toLocaleString()}`
        + ` · alerts ${p?.alerts_raised ?? 0}`
        + ` · incidents ${p?.incidents_open ?? 0}`
        + ` · injections blocked ${p?.injections_blocked ?? 0}`;
    case 'alert':
      return `${p?.origin === 'rule' ? 'RULE' : 'AI'} · ${p?.title ?? 'alert'} · ${p?.technique ?? ''} · ${String(p?.severity ?? '').toUpperCase()}`;
    case 'alert.flood':
      return 'alert flood detected — rate far above baseline';
    case 'ai.thinking':
      return `model working: ${p?.task ?? p?.message ?? 'analysing'}`;
    case 'ai.triage':
      return `triage reviewed ${p?.reviewed ?? '?'} anomalies, raised ${p?.raised ?? 0}`;
    case 'ai.analysis':
      return `independent analysis complete${p?.findings != null ? ` · ${p.findings} findings` : ''}`;
    // agreement_detail (assist.py) nests each verdict as {score, band},
    // so the two sides must be unwrapped rather than printed directly.
    // This is the line the whole dual-path design exists to produce, so it
    // is worth rendering precisely: both scores, both bands, and whether
    // the two independent methods actually agreed.
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
    // pipeline.py sends {deltas: [...]} — a list of edges added this batch.
    case 'graph.delta':
      return `entity graph grew by ${Array.isArray(p?.deltas) ? p.deltas.length : 0} relationships`;
    case 'remediation.proposed':
      return `plan drafted by ${p?.source ?? 'model'} · ${p?.steps ?? 0} steps · ${p?.awaiting_approval ?? 0} awaiting approval`;
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
    default:
      return kind;
  }
}

export const LiveThreatPage: React.FC = () => {
  const navigate = useNavigate();
  const { authUser } = useSOC();

  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [reached, setReached] = useState<Record<StageKey, number | null>>({
    ingest: null, detect: null, ai: null, incident: null, respond: null, approve: null, audit: null,
  });
  const [detail, setDetail] = useState<Partial<Record<StageKey, string>>>({});
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [incidentId, setIncidentId] = useState('');
  const [ledgerCount, setLedgerCount] = useState<number | null>(null);
  const seq = useRef(0);
  const feedBox = useRef<HTMLDivElement>(null);

  const canDrive = authUser?.role === 'manager' || authUser?.role === 'senior_analyst';

  // Observe the socket. Mounted for the life of the page so a run started
  // before you navigated here still lights up as it continues.
  useEffect(() => {
    const off = socStore.subscribePipeline((m: PipelineMessage) => {
      const stage = KIND_STAGE[m.kind] ?? null;

      if (stage) {
        setReached((prev) => (prev[stage] ? prev : { ...prev, [stage]: m.at }));
        const def = STAGES.find((s) => s.key === stage);
        const isHeadline = def?.headline === m.kind;
        const line = describe(m.kind, m.payload);
        setDetail((prev) => (
          // A headline frame always wins; anything else only fills a blank,
          // so a late low-value frame cannot bury the informative one.
          isHeadline || !prev[stage] ? { ...prev, [stage]: line } : prev
        ));
      }
      if (m.payload?.incident_id) setIncidentId(m.payload.incident_id);

      seq.current += 1;
      setFeed((prev) => [
        ...prev.slice(-140),
        { id: seq.current, at: m.at, kind: m.kind, stage, text: describe(m.kind, m.payload) },
      ]);
    });
    return off;
  }, []);

  // Keep the newest line in view without yanking the page around.
  useEffect(() => {
    const el = feedBox.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [feed.length]);

  // Once the ledger stage lands, show the real entry count.
  useEffect(() => {
    if (!reached.audit) return;
    backendApi.listLedger(1000)
      .then((rows) => setLedgerCount(Array.isArray(rows) ? rows.length : null))
      .catch(() => setLedgerCount(null));
  }, [reached.audit]);

  const start = useCallback(async () => {
    setError('');
    setStarting(true);
    setFeed([]);
    setIncidentId('');
    setLedgerCount(null);
    setDetail({});
    setReached({ ingest: null, detect: null, ai: null, incident: null, respond: null, approve: null, audit: null });
    try {
      await backendApi.demoStart(true);   // fresh AI-authored scenario
      await backendApi.demoPlay();        // let the backend walk it
      setRunning(true);
    } catch (e: any) {
      setError(e?.message || 'Could not start a run. Is the backend reachable?');
    } finally {
      setStarting(false);
    }
  }, []);

  const reset = useCallback(async () => {
    setError('');
    try {
      await backendApi.demoReset();
    } catch { /* the visual reset below still matters */ }
    setRunning(false);
    setFeed([]);
    setIncidentId('');
    setLedgerCount(null);
    setDetail({});
    setReached({ ingest: null, detect: null, ai: null, incident: null, respond: null, audit: null, approve: null });
  }, []);

  const doneCount = useMemo(
    () => STAGES.filter((s) => reached[s.key]).length,
    [reached],
  );
  const activeIdx = useMemo(() => {
    const i = STAGES.findIndex((s) => !reached[s.key]);
    return i === -1 ? STAGES.length : i;
  }, [reached]);

  const t0 = reached.ingest;
  const elapsed = (at: number | null) =>
    at && t0 ? `+${((at - t0) / 1000).toFixed(1)}s` : '';

  return (
    <div className="space-y-4">
      {/* ── header ─────────────────────────────────────────────── */}
      <div className="p-5 rounded-xl bg-soc-card border border-soc-border shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-[280px]">
            <div className="flex items-center gap-2 mb-1">
              <Radio className={clsx('w-4 h-4', running ? 'text-emerald-500 animate-pulse' : 'text-soc-textMuted')} />
              <span className="text-[11px] font-bold uppercase tracking-wider text-soc-accent">
                Live threat walkthrough
              </span>
            </div>
            <h1 className="text-xl font-bold text-soc-textPrimary">
              One threat, end to end
            </h1>
            <p className="text-xs text-soc-textSecondary mt-1 max-w-2xl">
              Generates a fresh AI-authored attack, then shows every stage as the
              backend actually performs it — detection, the blind second opinion,
              correlation, the proposed response, the human gate, and the signed
              ledger entry. Nothing on this page is animated ahead of the server.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={start}
              disabled={starting || !canDrive}
              title={canDrive ? undefined : 'Requires senior analyst or manager'}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-colors',
                canDrive
                  ? 'bg-soc-accent text-white hover:opacity-90'
                  : 'bg-soc-border text-soc-textMuted cursor-not-allowed',
              )}
            >
              {starting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              {starting ? 'Starting…' : 'Generate live threat'}
            </button>
            <button
              onClick={reset}
              disabled={!canDrive}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border border-soc-border text-soc-textSecondary hover:border-soc-borderLight transition-colors disabled:opacity-40"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
          </div>
        </div>

        {!canDrive && (
          <p className="mt-3 text-[11px] text-amber-500">
            You are signed in as <b>{authUser?.role}</b>. Generating a run changes shared
            state, so it needs a senior analyst or manager — the same server-side
            check that governs approvals.
          </p>
        )}
        {error && <p className="mt-3 text-[11px] text-red-500">{error}</p>}

        {/* progress */}
        <div className="mt-4 flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full bg-soc-border overflow-hidden">
            <div
              className="h-full bg-soc-accent transition-all duration-500"
              style={{ width: `${(doneCount / STAGES.length) * 100}%` }}
            />
          </div>
          <span className="text-[11px] font-mono text-soc-textMuted tabular-nums">
            {doneCount}/{STAGES.length} stages
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* ── the seven stages ─────────────────────────────────── */}
        <div className="lg:col-span-7 space-y-2">
          {STAGES.map((s, i) => {
            const done = !!reached[s.key];
            const active = i === activeIdx && running && !done;
            const Icon = s.icon;
            return (
              <div
                key={s.key}
                className={clsx(
                  'p-4 rounded-xl border transition-all duration-300',
                  done
                    ? 'bg-soc-card border-emerald-500/40'
                    : active
                      ? 'bg-soc-card border-soc-accent shadow-sm'
                      : 'bg-soc-card/50 border-soc-border',
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={clsx(
                      'w-8 h-8 shrink-0 rounded-lg flex items-center justify-center',
                      done
                        ? 'bg-emerald-500/15 text-emerald-500'
                        : active
                          ? 'bg-soc-accent/15 text-soc-accent'
                          : 'bg-soc-border/50 text-soc-textMuted',
                    )}
                  >
                    {done ? <CheckCircle2 className="w-4 h-4" />
                      : active ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Icon className="w-4 h-4" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-mono text-soc-textMuted">
                        {String(s.n).padStart(2, '0')}
                      </span>
                      <h3 className={clsx(
                        'text-sm font-bold',
                        done || active ? 'text-soc-textPrimary' : 'text-soc-textMuted',
                      )}>
                        {s.label}
                      </h3>
                      {done && (
                        <span className="text-[10px] font-mono text-emerald-500 tabular-nums">
                          {elapsed(reached[s.key])}
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-soc-textSecondary mt-0.5">{s.what}</p>

                    {detail[s.key] && (
                      <p className="mt-2 text-[11px] font-mono text-soc-textPrimary bg-soc-bg/60 border border-soc-border rounded px-2 py-1.5 break-words">
                        {detail[s.key]}
                      </p>
                    )}

                    {/* jump-offs, only once the stage is real */}
                    {done && s.key === 'incident' && incidentId && (
                      <button
                        onClick={() => navigate(`/incident/${incidentId}`)}
                        className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-soc-accent hover:underline"
                      >
                        Open this incident <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                    {done && s.key === 'approve' && (
                      <button
                        onClick={() => navigate('/approvals')}
                        className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-soc-accent hover:underline"
                      >
                        Review it in the approval queue <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                    {done && s.key === 'audit' && (
                      <button
                        onClick={() => navigate('/evidence')}
                        className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-soc-accent hover:underline"
                      >
                        Verify it in the ledger
                        {ledgerCount != null && ` (${ledgerCount} records)`}
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* The gate is the point of the whole page, so say so where the
              judge is already looking rather than in a legend somewhere. */}
          {reached.approve && !reached.audit && (
            <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-500/5">
              <p className="text-xs font-bold text-amber-500 mb-1">
                Stopped here on purpose
              </p>
              <p className="text-[11px] text-soc-textSecondary">
                The system has the plan, the target and the justification. It will not
                execute until a named human approves — approve it in the queue and
                stage 7 completes on its own.
              </p>
            </div>
          )}
        </div>

        {/* ── live socket feed ─────────────────────────────────── */}
        <div className="lg:col-span-5">
          <div className="rounded-xl bg-soc-card border border-soc-border shadow-sm overflow-hidden sticky top-4">
            <div className="px-4 py-3 border-b border-soc-border flex items-center justify-between">
              <div>
                <h2 className="text-xs font-bold text-soc-textPrimary">Live backend feed</h2>
                <p className="text-[10px] text-soc-textMuted mt-0.5">
                  Raw WebSocket frames, unedited
                </p>
              </div>
              <span className="text-[10px] font-mono text-soc-textMuted tabular-nums">
                {feed.length}
              </span>
            </div>
            <div ref={feedBox} className="h-[560px] overflow-y-auto p-3 space-y-1 font-mono text-[10.5px]">
              {feed.length === 0 && (
                <p className="text-soc-textMuted p-2">
                  Nothing yet. Press <b>Generate live threat</b> — or wait, the backend
                  starts a new scenario on its own every 15 minutes.
                </p>
              )}
              {feed.map((f) => (
                <div key={f.id} className="flex gap-2 items-baseline">
                  <span className="text-soc-textMuted tabular-nums shrink-0">
                    {new Date(f.at).toLocaleTimeString([], { hour12: false })}
                  </span>
                  <span className={clsx(
                    'shrink-0 px-1 rounded text-[9px] font-bold uppercase',
                    f.stage ? 'bg-soc-accent/15 text-soc-accent' : 'bg-soc-border/50 text-soc-textMuted',
                  )}>
                    {f.kind}
                  </span>
                  <span className="text-soc-textSecondary break-all">{f.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveThreatPage;
