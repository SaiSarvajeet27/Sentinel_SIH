// Live Threat — the judge-facing view of the pipeline.
//
// Everything here is an observer. The page starts the same backend run the
// rest of the app uses (POST /api/demo/start + /play) and then renders the
// WebSocket frames as they arrive; it simulates no stage and holds no
// timers that advance the flow on their own. If the backend stalls, this
// page stalls with it — which is the point, because a walkthrough that
// animated regardless of what the server did would prove nothing to the
// person watching it.
//
// Run state lives in liveThreatStore, outside React, so walking off to the
// incident this page just produced and coming back does not lose the run.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  Radio, Play, RotateCcw, ArrowRight, CheckCircle2, Loader2, ChevronDown,
  ChevronRight, Code2, Mail, ShieldAlert, Cpu, GitMerge, Zap, UserCheck,
  Lock, FileLock2, Activity, Gauge,
} from 'lucide-react';
import { useSOC } from '../components/common/SOCContext';
import { backendApi } from '../services/backendApi';
import { liveThreatStore, STAGES, type StageKey } from '../services/liveThreatStore';

const SPEEDS = [0.5, 1, 2, 4];

const STAGE_ICON: Record<StageKey, React.ElementType> = {
  generated: Radio, processed: Activity, sigma: ShieldAlert, ai: Cpu,
  incident: GitMerge, recommend: Zap, approval: UserCheck,
  execute: Lock, audit: FileLock2,
};

const hhmmss = (t: number | null) =>
  t ? new Date(t).toLocaleTimeString([], { hour12: false }) : '—';

/** A card that has nothing to show yet, phrased as a state not an error. */
const Idle: React.FC<{ icon: React.ElementType; title: string; body: string }> =
  ({ icon: Icon, title, body }) => (
    <div className="rounded-xl bg-soc-card border border-soc-border p-8 flex flex-col items-center text-center gap-2">
      <div className="w-10 h-10 rounded-lg bg-soc-border/40 flex items-center justify-center">
        <Icon className="w-4 h-4 text-soc-textMuted" />
      </div>
      <h3 className="text-xs font-bold text-soc-textPrimary">{title}</h3>
      <p className="text-[11px] text-soc-textSecondary max-w-xs">{body}</p>
    </div>
  );

const Field: React.FC<{ label: string; value: string; icon?: React.ElementType }> =
  ({ label, value, icon: Icon }) => (
    <div className="rounded-lg border border-soc-border bg-soc-bg/40 px-3 py-2 min-w-0">
      <div className="flex items-center gap-1.5 mb-0.5">
        {Icon && <Icon className="w-3 h-3 text-soc-textMuted shrink-0" />}
        <span className="text-[9px] font-bold uppercase tracking-wider text-soc-textMuted">{label}</span>
      </div>
      <p className="text-[11.5px] font-mono text-soc-textPrimary break-all">{value || '—'}</p>
    </div>
  );

export const LiveThreatPage: React.FC = () => {
  const navigate = useNavigate();
  const { authUser } = useSOC();

  const [, force] = useState(0);
  useEffect(() => liveThreatStore.subscribe(() => force((n) => n + 1)), []);

  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [speed, setSpeed] = useState(1);
  const [open, setOpen] = useState<StageKey | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const stripRef = useRef<HTMLDivElement>(null);

  const s = liveThreatStore;
  const canDrive = authUser?.role === 'manager' || authUser?.role === 'senior_analyst';

  // Elapsed clock. Ticks off wall time since the run began; it drives no
  // stage, it only reports.
  useEffect(() => {
    if (!s.startedAt) { setElapsed(0); return; }
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - s.startedAt!) / 1000)), 500);
    return () => clearInterval(id);
  }, [s.startedAt, s.running]);

  // Keep the active stage in view as the run walks along the strip.
  useEffect(() => {
    const el = stripRef.current?.children[s.activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [s.activeIndex]);

  const start = useCallback(async () => {
    setError('');
    setStarting(true);
    liveThreatStore.clear(false);
    try {
      await backendApi.demoStart(true);
      await backendApi.demoPlay(speed);
      liveThreatStore.setRunning(true);
    } catch (e: any) {
      setError(e?.message || 'Could not start a run. Is the backend reachable?');
      liveThreatStore.setRunning(false);
    } finally {
      setStarting(false);
    }
  }, [speed]);

  const reset = useCallback(async () => {
    setError('');
    try { await backendApi.demoReset(); } catch { /* visual reset still matters */ }
    liveThreatStore.clear();
  }, []);

  const currentStageLabel =
    s.activeIndex < STAGES.length ? STAGES[s.activeIndex].label
      : s.doneCount ? 'Complete' : 'Idle';

  return (
    <div className="space-y-4">
      {/* ── header ─────────────────────────────────────────────── */}
      <div className="p-5 rounded-xl bg-soc-card border border-soc-border shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-[300px]">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-soc-accent/15 text-soc-accent">
                Live pipeline
              </span>
              <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-500">
                Real backend
              </span>
            </div>
            <h1 className="text-xl font-bold text-soc-textPrimary">Live Threat Response</h1>
            <p className="text-xs text-soc-textSecondary mt-1 max-w-2xl">
              End-to-end detection, AI evaluation, human authorisation and governed
              response — every stage driven by the backend as it happens. Click a
              stage for how it works and what it did to this threat.
            </p>
          </div>

          <div className="flex items-stretch gap-2">
            <div className="px-4 py-2 rounded-lg border border-soc-border text-center min-w-[130px]">
              <div className="text-[9px] font-bold uppercase tracking-wider text-soc-textMuted">Current stage</div>
              <div className="text-[11.5px] font-bold text-soc-textPrimary mt-0.5 truncate">
                {currentStageLabel}
              </div>
            </div>
            <div className="px-4 py-2 rounded-lg border border-soc-border text-center min-w-[80px]">
              <div className="text-[9px] font-bold uppercase tracking-wider text-soc-textMuted">Elapsed</div>
              <div className="text-[11.5px] font-bold text-soc-textPrimary mt-0.5 font-mono tabular-nums">
                {elapsed}s
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={start}
              disabled={starting || !canDrive}
              title={canDrive ? undefined : 'Requires senior analyst or manager'}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-colors',
                canDrive ? 'bg-soc-accent text-white hover:opacity-90'
                  : 'bg-soc-border text-soc-textMuted cursor-not-allowed')}
            >
              {starting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              {starting ? 'Starting…' : 'Start live threat'}
            </button>
            <button
              onClick={reset}
              disabled={!canDrive}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border border-soc-border text-soc-textSecondary hover:border-soc-borderLight transition-colors disabled:opacity-40"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Speed is real: it divides the pause between stages on the
                server. It never shortens the work — detection, scoring and
                the model calls take exactly as long as they take. */}
            <div className="flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-soc-textMuted" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-soc-textMuted">Speed</span>
              <div className="flex rounded-lg border border-soc-border overflow-hidden">
                {SPEEDS.map((x) => (
                  <button
                    key={x}
                    onClick={() => setSpeed(x)}
                    className={clsx('px-2 py-1 text-[10px] font-mono font-bold transition-colors',
                      speed === x ? 'bg-soc-accent text-white'
                        : 'text-soc-textSecondary hover:bg-soc-bg/60')}
                  >
                    {x}x
                  </button>
                ))}
              </div>
            </div>
            {s.scenario && (
              <div className="text-[10px] text-soc-textSecondary">
                <span className="font-bold uppercase tracking-wider text-soc-textMuted">Scenario: </span>
                {s.scenario}
              </div>
            )}
          </div>
        </div>

        {!canDrive && (
          <p className="mt-3 text-[11px] text-amber-500">
            You are signed in as <b>{authUser?.role}</b>. Starting a run changes shared
            state, so it needs a senior analyst or manager — the same server-side check
            that governs approvals.
          </p>
        )}
        {error && <p className="mt-3 text-[11px] text-red-500">{error}</p>}
        {s.running && s.doneCount > 0 && s.doneCount < STAGES.length && (
          <p className="mt-3 text-[10.5px] text-soc-textMuted">
            This keeps running if you navigate away — the backend drives it, and the page
            picks up wherever it got to when you come back.
          </p>
        )}
      </div>

      {/* ── 9-stage strip ──────────────────────────────────────── */}
      <div className="p-4 rounded-xl bg-soc-card border border-soc-border shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className={clsx('w-2 h-2 rounded-full',
              s.running ? 'bg-emerald-500 animate-pulse' : 'bg-soc-textMuted')} />
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-soc-textPrimary">
              End-to-end threat response pipeline
            </h2>
          </div>
          <span className="text-[10px] text-soc-textMuted">
            {s.doneCount}/{STAGES.length} stages · governed flow
          </span>
        </div>

        <div ref={stripRef} className="flex gap-2 overflow-x-auto pb-1">
          {STAGES.map((def, i) => {
            const done = !!s.reached[def.key];
            const active = i === s.activeIndex && s.running && !done;
            const Icon = STAGE_ICON[def.key];
            return (
              <button
                key={def.key}
                onClick={() => setOpen(open === def.key ? null : def.key)}
                className={clsx(
                  'shrink-0 w-[168px] text-left p-3 rounded-lg border transition-all',
                  done ? 'bg-emerald-500/5 border-emerald-500/40'
                    : active ? 'bg-soc-accent/5 border-soc-accent'
                      : 'bg-soc-bg/30 border-soc-border',
                  open === def.key && 'ring-1 ring-soc-accent')}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-mono text-soc-textMuted">
                    {String(def.n).padStart(2, '0')}
                  </span>
                  <span className={clsx(
                    'text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1',
                    done ? 'bg-emerald-500/15 text-emerald-500'
                      : active ? 'bg-soc-accent/15 text-soc-accent'
                        : 'bg-soc-border/50 text-soc-textMuted')}>
                    {done ? <CheckCircle2 className="w-2.5 h-2.5" />
                      : active ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : null}
                    {done ? 'Done' : active ? 'Active' : 'Pending'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className={clsx('w-3 h-3 shrink-0',
                    done ? 'text-emerald-500' : active ? 'text-soc-accent' : 'text-soc-textMuted')} />
                  <span className="text-[11px] font-bold text-soc-textPrimary truncate">{def.label}</span>
                </div>
                <p className="text-[9.5px] text-soc-textSecondary line-clamp-2 leading-snug">
                  {def.blurb}
                </p>
                <p className="mt-1.5 text-[9.5px] font-mono text-soc-textMuted tabular-nums">
                  {hhmmss(s.reached[def.key])}
                </p>
              </button>
            );
          })}
        </div>

        {/* expanded stage explanation */}
        {open && (() => {
          const def = STAGES.find((x) => x.key === open)!;
          const frames = s.frames[def.key];
          return (
            <div className="mt-3 pt-3 border-t border-soc-border">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-soc-textPrimary">
                  {String(def.n).padStart(2, '0')} · {def.label}
                </h3>
                <button onClick={() => setOpen(null)}
                  className="text-[10px] text-soc-textMuted hover:text-soc-textPrimary">
                  Close
                </button>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-soc-accent mb-1.5">
                    How this stage works
                  </h4>
                  {def.detail.split('\n\n').map((p, k) => (
                    <p key={k} className="text-[11.5px] leading-relaxed text-soc-textSecondary mb-2">{p}</p>
                  ))}
                  <div className="flex items-start gap-2">
                    <Code2 className="w-3 h-3 mt-0.5 shrink-0 text-soc-textMuted" />
                    <p className="text-[10px] font-mono text-soc-textMuted break-all">{def.source}</p>
                  </div>
                </div>
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-soc-accent mb-1.5">
                    What it did to this threat
                  </h4>
                  {frames.length === 0 ? (
                    <p className="text-[11.5px] text-soc-textMuted italic">
                      This stage has not run yet for the current threat.
                    </p>
                  ) : (
                    <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
                      {frames.map((f) => (
                        <div key={f.id} className="font-mono text-[10.5px] flex gap-2 items-baseline">
                          <span className="text-soc-textMuted tabular-nums shrink-0">{hhmmss(f.at)}</span>
                          <span className="shrink-0 px-1 rounded text-[9px] font-bold uppercase bg-soc-accent/15 text-soc-accent">
                            {f.kind}
                          </span>
                          <span className="text-soc-textSecondary break-all">{f.text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── detail columns ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* left: telemetry → rule → verdict */}
        <div className="space-y-4">
          {s.eventCard ? (
            <div className="rounded-xl bg-soc-card border border-soc-border p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-red-500/15 text-red-500 flex items-center justify-center shrink-0">
                    <Mail className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-mono font-bold text-soc-textPrimary">
                        {s.eventCard.id.slice(0, 22)}
                      </span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/15 text-red-500 uppercase">
                        {s.eventCard.severity}
                      </span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded border border-soc-border text-soc-textMuted">
                        {s.eventCard.source}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-soc-textPrimary mt-0.5">{s.eventCard.title}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                <Field label="Target user" value={s.eventCard.user} />
                <Field label="Host device" value={s.eventCard.host} />
                <Field label="External IP" value={s.eventCard.ip} />
              </div>

              <div className="rounded-lg border border-soc-border bg-soc-bg/40 px-3 py-2 mb-3">
                <span className="text-[9px] font-bold uppercase tracking-wider text-soc-textMuted">
                  Correlation
                </span>
                <p className="text-[11px] text-soc-textSecondary mt-1">
                  {s.detail.processed || 'Awaiting normalisation counters.'}
                </p>
              </div>

              <button
                onClick={() => setShowRaw(!showRaw)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-soc-border text-[11px] text-soc-textSecondary hover:border-soc-borderLight transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <Code2 className="w-3 h-3" /> Raw ingested socket payload
                </span>
                <ChevronRight className={clsx('w-3 h-3 transition-transform', showRaw && 'rotate-90')} />
              </button>
              {showRaw && (
                <pre className="mt-2 p-3 rounded-lg bg-soc-bg/60 border border-soc-border text-[10px] font-mono text-soc-textSecondary overflow-x-auto max-h-56 overflow-y-auto">
                  {JSON.stringify(s.frames.sigma[s.frames.sigma.length - 1]?.payload ?? {}, null, 2)}
                </pre>
              )}
            </div>
          ) : (
            <Idle icon={Radio} title="Waiting for ingested telemetry"
              body="Start a live threat to ingest synthetic email gateway, identity and endpoint telemetry." />
          )}

          {s.ruleCard ? (
            <div className="rounded-xl bg-soc-card border border-soc-border p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
                    <ShieldAlert className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-mono font-bold text-soc-textPrimary">
                        {s.ruleCard.ruleId}
                      </span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-500 uppercase">
                        Match
                      </span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded border border-soc-border text-soc-textMuted uppercase">
                        {s.ruleCard.origin === 'rule' ? 'Written rule' : 'AI-raised'}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-soc-textPrimary mt-0.5">{s.ruleCard.title}</p>
                  </div>
                </div>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/15 text-red-500 uppercase shrink-0">
                  {s.ruleCard.severity}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Field label="MITRE technique" value={s.ruleCard.technique} />
                <Field label="Tactic" value={s.ruleCard.tactic} />
              </div>
            </div>
          ) : (
            <Idle icon={ShieldAlert} title="Sigma rule engine idle"
              body="Deterministic rule analysis activates once raw telemetry has been ingested and correlated." />
          )}

          {s.verdictCard ? (
            <div className="rounded-xl bg-soc-card border border-soc-border p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Cpu className="w-3.5 h-3.5 text-soc-accent" />
                <h3 className="text-xs font-bold text-soc-textPrimary">Dual-path verdict</h3>
                {s.verdictCard.agreement && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-soc-accent/15 text-soc-accent uppercase">
                    {s.verdictCard.agreement}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Deterministic rules" value={s.verdictCard.rules} />
                <Field label="AI model (blind)" value={s.verdictCard.model} />
              </div>
              {s.verdictCard.actedOn && (
                <p className="text-[10.5px] text-soc-textMuted mt-2">
                  Acted on the <b className="text-soc-textSecondary">{s.verdictCard.actedOn}</b> verdict —
                  the system takes whichever path is more worried.
                </p>
              )}
            </div>
          ) : (
            <Idle icon={Cpu} title="AI decision intelligence idle"
              body="The model’s independent assessment runs once detection fires, blind to the rules’ score." />
          )}
        </div>

        {/* right: incident → plan → governance → audit */}
        <div className="space-y-4">
          {s.incidentCard ? (
            <div className="rounded-xl bg-soc-card border border-soc-border p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-red-500/15 text-red-500 flex items-center justify-center shrink-0">
                    <GitMerge className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-mono font-bold text-soc-textPrimary">
                        {s.incidentCard.id.slice(0, 22)}
                      </span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 uppercase">
                        {s.incidentCard.status}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-soc-textPrimary mt-0.5">
                      {s.incidentCard.title}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-soc-textMuted">Risk score</div>
                  <div className="text-lg font-extrabold text-red-500 tabular-nums leading-tight">
                    {s.incidentCard.risk}<span className="text-[11px] text-soc-textMuted"> / 100</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <Field label="Target user" value={s.incidentCard.user} />
                <Field label="Host" value={s.incidentCard.host} />
              </div>
              <button
                onClick={() => navigate(`/incident/${s.incidentCard!.id}`)}
                className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-soc-accent hover:underline"
              >
                Open the full investigation <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <Idle icon={GitMerge} title="Incident formulation idle"
              body="Incidents are correlated from related alerts once threat evaluation completes." />
          )}

          {s.planCard && (
            <div className="rounded-xl bg-soc-card border border-soc-border p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-3.5 h-3.5 text-soc-accent" />
                <h3 className="text-xs font-bold text-soc-textPrimary">Recommended response</h3>
                <span className="text-[9px] px-1.5 py-0.5 rounded border border-soc-border text-soc-textMuted uppercase">
                  drafted by {s.planCard.source}
                </span>
              </div>
              {s.planCard.summary && (
                <p className="text-[11.5px] text-soc-textSecondary mb-2">{s.planCard.summary}</p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Field label="Plan steps" value={String(s.planCard.steps)} />
                <Field label="Awaiting approval" value={String(s.planCard.awaiting)} />
              </div>
            </div>
          )}

          {s.actionCards.length ? (
            <div className="rounded-xl bg-soc-card border border-soc-border p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <UserCheck className="w-3.5 h-3.5 text-amber-500" />
                <h3 className="text-xs font-bold text-soc-textPrimary">Governed actions</h3>
              </div>
              <div className="space-y-2">
                {s.actionCards.map((a) => (
                  <div key={a.id} className="rounded-lg border border-soc-border bg-soc-bg/40 px-3 py-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-[11.5px] font-semibold text-soc-textPrimary">{a.kind}</span>
                      <div className="flex items-center gap-1.5">
                        <span className={clsx('text-[9px] font-bold px-1.5 py-0.5 rounded uppercase',
                          a.tier >= 2 ? 'bg-amber-500/15 text-amber-500'
                            : 'bg-emerald-500/15 text-emerald-500')}>
                          Tier {a.tier}
                        </span>
                        <span className={clsx('text-[9px] font-bold px-1.5 py-0.5 rounded uppercase',
                          a.status === 'pending' ? 'bg-amber-500/15 text-amber-500'
                            : a.status === 'executed' ? 'bg-emerald-500/15 text-emerald-500'
                              : 'bg-soc-border/50 text-soc-textMuted')}>
                          {a.status}
                        </span>
                      </div>
                    </div>
                    {a.target && (
                      <p className="text-[10px] font-mono text-soc-textMuted mt-1">target: {a.target}</p>
                    )}
                  </div>
                ))}
              </div>
              {s.actionCards.some((a) => a.status === 'pending') && (
                <>
                  <div className="mt-3 p-3 rounded-lg border border-amber-500/40 bg-amber-500/5">
                    <p className="text-[11px] font-bold text-amber-500 mb-0.5">Stopped here on purpose</p>
                    <p className="text-[10.5px] text-soc-textSecondary">
                      The system has the plan, the target and the justification. It will not
                      execute until a named human approves.
                    </p>
                  </div>
                  <button
                    onClick={() => navigate('/approvals')}
                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-soc-accent hover:underline"
                  >
                    Authorise it in the approval queue <ArrowRight className="w-3 h-3" />
                  </button>
                </>
              )}
            </div>
          ) : (
            <Idle icon={Lock} title="Human governance interlock on standby"
              body="When the run reaches the approval stage it holds automatically and waits for a named analyst." />
          )}

          <div className="rounded-xl bg-soc-card border border-soc-border p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <FileLock2 className="w-3.5 h-3.5 text-emerald-500" />
                <h3 className="text-xs font-bold text-soc-textPrimary">Immutable audit trail</h3>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-500 uppercase">
                  SHA-256 chained
                </span>
              </div>
              {s.ledgerRecords != null && (
                <span className="text-[10px] font-mono text-soc-textMuted tabular-nums">
                  {s.ledgerRecords} records
                </span>
              )}
            </div>
            {s.ledgerRecords == null ? (
              <p className="text-[11px] text-soc-textSecondary">
                Every verdict, approval and executed action is appended here, hash-chained
                to the entry before it and signed with a key held outside the application.
              </p>
            ) : (
              <>
                <Field label="Latest entry hash" value={s.ledgerLatestHash} />
                <button
                  onClick={() => navigate('/evidence')}
                  className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-soc-accent hover:underline"
                >
                  Verify the chain <ArrowRight className="w-3 h-3" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── live socket feed ───────────────────────────────────── */}
      <div className="rounded-xl bg-soc-card border border-soc-border shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-soc-border flex items-center justify-between">
          <div>
            <h2 className="text-xs font-bold text-soc-textPrimary">Live backend feed</h2>
            <p className="text-[10px] text-soc-textMuted mt-0.5">
              Raw WebSocket frames, unedited, newest first
            </p>
          </div>
          <span className="text-[10px] font-mono text-soc-textMuted tabular-nums">{s.feed.length}</span>
        </div>
        <div className="h-[320px] overflow-y-auto p-3 space-y-1 font-mono text-[10.5px] flex flex-col-reverse">
          {s.feed.length === 0 && (
            <p className="text-soc-textMuted p-2">
              Nothing yet. Press <b>Start live threat</b> — or wait, the backend starts a
              new scenario on its own every 15 minutes.
            </p>
          )}
          {[...s.feed].reverse().map((f) => (
            <div key={f.id} className="flex gap-2 items-baseline">
              <span className="text-soc-textMuted tabular-nums shrink-0">{hhmmss(f.at)}</span>
              <span className={clsx('shrink-0 px-1 rounded text-[9px] font-bold uppercase',
                f.stage ? 'bg-soc-accent/15 text-soc-accent' : 'bg-soc-border/50 text-soc-textMuted')}>
                {f.kind}
              </span>
              <span className="text-soc-textSecondary break-all">{f.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LiveThreatPage;
