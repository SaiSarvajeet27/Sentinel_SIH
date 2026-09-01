// Live Threat — the judge-facing view of the pipeline.
//
// Everything here is an observer. The page starts the same backend run the
// rest of the app uses (POST /api/demo/start + /play) and then renders the
// WebSocket frames as they arrive; it does not simulate a single stage, and
// it holds no timers that advance the flow on their own. If the backend
// stalls, this page stalls with it — which is the point, because a
// walkthrough that animates regardless of what the server did would prove
// nothing to the person watching it.
//
// All run state lives in liveThreatStore, outside React, so walking off to
// the incident this page just produced and coming back does not throw the
// walkthrough away.
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  Activity, ShieldAlert, Cpu, GitMerge, Zap, UserCheck, FileLock2,
  Play, RotateCcw, ArrowRight, CheckCircle2, Loader2, Radio, ChevronDown, Code2,
} from 'lucide-react';
import { useSOC } from '../components/common/SOCContext';
import { backendApi } from '../services/backendApi';
import {
  liveThreatStore, STAGES, type StageKey,
} from '../services/liveThreatStore';

const ICONS: Record<StageKey, React.ElementType> = {
  ingest: Activity, detect: ShieldAlert, ai: Cpu, incident: GitMerge,
  respond: Zap, approve: UserCheck, audit: FileLock2,
};

export const LiveThreatPage: React.FC = () => {
  const navigate = useNavigate();
  const { authUser } = useSOC();

  // Re-render on store changes; the store itself owns the data.
  const [, force] = useState(0);
  useEffect(() => liveThreatStore.subscribe(() => force((n) => n + 1)), []);

  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<StageKey | null>(null);
  const [ledgerCount, setLedgerCount] = useState<number | null>(null);

  const s = liveThreatStore;
  const canDrive = authUser?.role === 'manager' || authUser?.role === 'senior_analyst';

  useEffect(() => {
    if (!s.reached.audit) return;
    backendApi.listLedger(1000)
      .then((rows) => setLedgerCount(Array.isArray(rows) ? rows.length : null))
      .catch(() => setLedgerCount(null));
  }, [s.reached.audit]);

  const start = useCallback(async () => {
    setError('');
    setStarting(true);
    setLedgerCount(null);
    liveThreatStore.clear(false);
    try {
      await backendApi.demoStart(true);
      await backendApi.demoPlay();
      liveThreatStore.setRunning(true);
    } catch (e: any) {
      setError(e?.message || 'Could not start a run. Is the backend reachable?');
      liveThreatStore.setRunning(false);
    } finally {
      setStarting(false);
    }
  }, []);

  const reset = useCallback(async () => {
    setError('');
    setLedgerCount(null);
    try { await backendApi.demoReset(); } catch { /* visual reset still matters */ }
    liveThreatStore.clear();
  }, []);

  const t0 = s.reached.ingest;
  const elapsed = (at: number | null) => (at && t0 ? `+${((at - t0) / 1000).toFixed(1)}s` : '');

  return (
    <div className="space-y-4">
      {/* ── header ─────────────────────────────────────────────── */}
      <div className="p-5 rounded-xl bg-soc-card border border-soc-border shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-[280px]">
            <div className="flex items-center gap-2 mb-1">
              <Radio className={clsx('w-4 h-4', s.running ? 'text-emerald-500 animate-pulse' : 'text-soc-textMuted')} />
              <span className="text-[11px] font-bold uppercase tracking-wider text-soc-accent">
                Live threat walkthrough
              </span>
            </div>
            <h1 className="text-xl font-bold text-soc-textPrimary">One threat, end to end</h1>
            <p className="text-xs text-soc-textSecondary mt-1 max-w-2xl">
              Generates a fresh attack, then shows every stage as the backend actually
              performs it — detection, the blind second opinion, correlation, the
              proposed response, the human gate, and the signed ledger entry.
              Click any stage for how it works and what it did to this threat.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={start}
              disabled={starting || !canDrive}
              title={canDrive ? undefined : 'Requires senior analyst or manager'}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-colors',
                canDrive ? 'bg-soc-accent text-white hover:opacity-90'
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
            state, so it needs a senior analyst or manager — the same server-side check
            that governs approvals.
          </p>
        )}
        {error && <p className="mt-3 text-[11px] text-red-500">{error}</p>}

        <div className="mt-4 flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full bg-soc-border overflow-hidden">
            <div
              className="h-full bg-soc-accent transition-all duration-500"
              style={{ width: `${(s.doneCount / STAGES.length) * 100}%` }}
            />
          </div>
          <span className="text-[11px] font-mono text-soc-textMuted tabular-nums">
            {s.doneCount}/{STAGES.length} stages
          </span>
        </div>

        {s.running && s.doneCount > 0 && s.doneCount < STAGES.length && (
          <p className="mt-2 text-[10.5px] text-soc-textMuted">
            This keeps running if you navigate away — the backend drives it, and this
            page picks up wherever it got to when you come back.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* ── the seven stages ─────────────────────────────────── */}
        <div className="lg:col-span-7 space-y-2">
          {STAGES.map((def, i) => {
            const done = !!s.reached[def.key];
            const active = i === s.activeIndex && s.running && !done;
            const expanded = open === def.key;
            const Icon = ICONS[def.key];
            const stageFrames = s.frames[def.key];

            return (
              <div
                key={def.key}
                className={clsx(
                  'rounded-xl border transition-all duration-300 overflow-hidden',
                  done ? 'bg-soc-card border-emerald-500/40'
                    : active ? 'bg-soc-card border-soc-accent shadow-sm'
                      : 'bg-soc-card/50 border-soc-border',
                )}
              >
                <button
                  onClick={() => setOpen(expanded ? null : def.key)}
                  aria-expanded={expanded}
                  className="w-full text-left p-4 flex items-start gap-3 hover:bg-soc-bg/30 transition-colors"
                >
                  <div className={clsx(
                    'w-8 h-8 shrink-0 rounded-lg flex items-center justify-center',
                    done ? 'bg-emerald-500/15 text-emerald-500'
                      : active ? 'bg-soc-accent/15 text-soc-accent'
                        : 'bg-soc-border/50 text-soc-textMuted',
                  )}>
                    {done ? <CheckCircle2 className="w-4 h-4" />
                      : active ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Icon className="w-4 h-4" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-mono text-soc-textMuted">
                        {String(def.n).padStart(2, '0')}
                      </span>
                      <h3 className={clsx('text-sm font-bold',
                        done || active ? 'text-soc-textPrimary' : 'text-soc-textMuted')}>
                        {def.label}
                      </h3>
                      {done && (
                        <span className="text-[10px] font-mono text-emerald-500 tabular-nums">
                          {elapsed(s.reached[def.key])}
                        </span>
                      )}
                      {done && stageFrames.length > 0 && (
                        <span className="text-[10px] font-mono text-soc-textMuted">
                          · {stageFrames.length} frame{stageFrames.length === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-soc-textSecondary mt-0.5">{def.what}</p>
                    {s.detail[def.key] && (
                      <p className="mt-2 text-[11px] font-mono text-soc-textPrimary bg-soc-bg/60 border border-soc-border rounded px-2 py-1.5 break-words">
                        {s.detail[def.key]}
                      </p>
                    )}
                  </div>

                  <ChevronDown className={clsx(
                    'w-4 h-4 shrink-0 mt-1 text-soc-textMuted transition-transform',
                    expanded && 'rotate-180',
                  )} />
                </button>

                {/* ── expanded detail ──────────────────────────── */}
                {expanded && (
                  <div className="px-4 pb-4 pl-[60px] space-y-3 border-t border-soc-border pt-3">
                    <div>
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-soc-accent mb-1.5">
                        How this stage works
                      </h4>
                      {def.detail.split('\n\n').map((para, k) => (
                        <p key={k} className="text-[11.5px] leading-relaxed text-soc-textSecondary mb-2">
                          {para}
                        </p>
                      ))}
                    </div>

                    <div>
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-soc-accent mb-1.5">
                        What it did to this threat
                      </h4>
                      {stageFrames.length === 0 ? (
                        <p className="text-[11.5px] text-soc-textMuted italic">
                          This stage has not run yet for the current threat.
                        </p>
                      ) : (
                        <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                          {stageFrames.map((f) => (
                            <div key={f.id} className="font-mono text-[10.5px] flex gap-2 items-baseline">
                              <span className="text-soc-textMuted tabular-nums shrink-0">
                                {new Date(f.at).toLocaleTimeString([], { hour12: false })}
                              </span>
                              <span className="shrink-0 px-1 rounded text-[9px] font-bold uppercase bg-soc-accent/15 text-soc-accent">
                                {f.kind}
                              </span>
                              <span className="text-soc-textSecondary break-all">{f.text}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-start gap-2 pt-1">
                      <Code2 className="w-3 h-3 mt-0.5 shrink-0 text-soc-textMuted" />
                      <p className="text-[10px] font-mono text-soc-textMuted break-all">
                        {def.source}
                      </p>
                    </div>

                    {/* jump-offs, only once the stage is real */}
                    <div className="flex flex-wrap gap-3">
                      {done && def.key === 'incident' && s.incidentId && (
                        <button
                          onClick={() => navigate(`/incident/${s.incidentId}`)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-soc-accent hover:underline"
                        >
                          Open this incident <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                      {done && def.key === 'approve' && (
                        <button
                          onClick={() => navigate('/approvals')}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-soc-accent hover:underline"
                        >
                          Review it in the approval queue <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                      {done && def.key === 'audit' && (
                        <button
                          onClick={() => navigate('/evidence')}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-soc-accent hover:underline"
                        >
                          Verify it in the ledger
                          {ledgerCount != null && ` (${ledgerCount} records)`}
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {s.reached.approve && !s.reached.audit && (
            <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-500/5">
              <p className="text-xs font-bold text-amber-500 mb-1">Stopped here on purpose</p>
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
                <p className="text-[10px] text-soc-textMuted mt-0.5">Raw WebSocket frames, unedited</p>
              </div>
              <span className="text-[10px] font-mono text-soc-textMuted tabular-nums">{s.feed.length}</span>
            </div>
            <div className="h-[560px] overflow-y-auto p-3 space-y-1 font-mono text-[10.5px] flex flex-col-reverse">
              {/* Reversed so the newest line is always visible without
                  scripting the scroll position on every frame. */}
              {s.feed.length === 0 && (
                <p className="text-soc-textMuted p-2">
                  Nothing yet. Press <b>Generate live threat</b> — or wait, the backend
                  starts a new scenario on its own every 15 minutes.
                </p>
              )}
              {[...s.feed].reverse().map((f) => (
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
