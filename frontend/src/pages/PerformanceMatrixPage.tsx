// Quantitative performance matrix.
//
// The point of this screen is that its numbers can be checked. Detection is
// scored against a ground-truth field stamped on attack events at
// generation which no detection rule reads; agreement is counted from
// decisions humans actually made; the governance rows count violations of
// the invariant the whole project rests on.
//
// So every figure states its own basis underneath it — "13 of 13 planted
// techniques detected" rather than a bare 100% — and anything not yet
// measurable renders as "not measured yet" instead of a plausible number.
// A panel that exists to demonstrate rigour cannot carry an invented value
// on it, and being visibly short of a target is worth more than a green
// tick nobody can verify.
import React, { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import {
  Activity, RefreshCw, ShieldCheck, Cpu, Target, AlertTriangle, Loader2,
} from 'lucide-react';
import { backendApi } from '../services/backendApi';

interface Metric {
  key: string; label: string; value: number | null; target: number | null;
  higher_is_better: boolean; unit: string; basis: string; note: string;
}
interface Invariant {
  key: string; label: string; value: number; expected: number;
  basis: string; ok: boolean;
}

/** A metric is only "met" when there is both a target and a measurement. */
const meets = (m: Metric) =>
  m.value == null || m.target == null ? null
    : m.higher_is_better ? m.value >= m.target : m.value <= m.target;

const fmt = (v: number | null, unit: string) => {
  if (v == null) return '—';
  if (unit === 's') {
    if (v < 90) return `${v}s`;
    if (v < 5400) return `${(v / 60).toFixed(1)}m`;
    return `${(v / 3600).toFixed(1)}h`;
  }
  return `${v}${unit}`;
};

export const PerformanceMatrixPage: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await backendApi.performance());
    } catch (e: any) {
      setError(e?.message || 'Could not read the performance matrix.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const metrics: Metric[] = data?.metrics ?? [];
  const invariants: Invariant[] = data?.governance ?? [];
  const ai = data?.ai;
  const met = metrics.filter((m) => meets(m) === true).length;
  const scored = metrics.filter((m) => meets(m) !== null).length;
  const breaches = invariants.filter((g) => !g.ok).length;

  return (
    <div className="space-y-4">
      {/* ── header ─────────────────────────────────────────────── */}
      <div className="p-5 rounded-xl bg-soc-card border border-soc-border shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-[280px]">
            <div className="w-9 h-9 rounded-xl bg-soc-accent/15 text-soc-accent flex items-center justify-center shrink-0">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-soc-textPrimary">Performance Matrix</h1>
              <p className="text-xs text-soc-textSecondary mt-1 max-w-2xl">
                Detection, response and governance measured against ground truth the
                system cannot see. Each figure shows the count it was derived from,
                so it can be checked rather than taken on trust.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {scored > 0 && (
              <div className="px-4 py-2 rounded-lg border border-soc-border text-center">
                <div className="text-[9px] font-bold uppercase tracking-wider text-soc-textMuted">
                  Targets met
                </div>
                <div className="text-[13px] font-bold text-soc-textPrimary mt-0.5 font-mono tabular-nums">
                  {met}/{scored}
                </div>
              </div>
            )}
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border border-soc-border text-soc-textSecondary hover:border-soc-borderLight transition-colors disabled:opacity-40"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <RefreshCw className="w-3.5 h-3.5" />}
              Re-measure
            </button>
          </div>
        </div>

        {error && <p className="mt-3 text-[11px] text-red-500">{error}</p>}
        {data && !data.labelled_run && (
          <p className="mt-3 text-[11px] text-amber-500">
            No labelled run in the database yet, so detection accuracy cannot be
            scored. Generate a threat and these fill in — they are deliberately
            left blank rather than estimated.
          </p>
        )}
      </div>

      {/* ── governance invariants ──────────────────────────────── */}
      <div className={clsx('p-4 rounded-xl border shadow-sm',
        breaches ? 'bg-red-500/5 border-red-500/40'
          : 'bg-soc-card border-emerald-500/40')}>
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className={clsx('w-4 h-4', breaches ? 'text-red-500' : 'text-emerald-500')} />
          <h2 className="text-xs font-bold text-soc-textPrimary uppercase tracking-wider">
            Governance invariants
          </h2>
          <span className={clsx('text-[9px] font-bold px-1.5 py-0.5 rounded uppercase',
            breaches ? 'bg-red-500/15 text-red-500' : 'bg-emerald-500/15 text-emerald-500')}>
            {breaches ? `${breaches} breached` : 'all holding'}
          </span>
        </div>
        <p className="text-[11px] text-soc-textSecondary mb-3 max-w-3xl">
          These count violations, so the expected answer is zero in every row. A
          non-zero number here would matter more than anything else on the page —
          it would mean the system executed something it promised it could not.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {invariants.map((g) => (
            <div key={g.key} className="rounded-lg border border-soc-border bg-soc-bg/40 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-soc-textPrimary">{g.label}</span>
                <span className={clsx('text-sm font-extrabold font-mono tabular-nums',
                  g.ok ? 'text-emerald-500' : 'text-red-500')}>
                  {g.value}
                </span>
              </div>
              <p className="text-[10px] text-soc-textMuted mt-1">{g.basis}</p>
            </div>
          ))}
          {!invariants.length && !loading && (
            <p className="text-[11px] text-soc-textMuted italic">Nothing to check yet.</p>
          )}
        </div>
      </div>

      {/* ── metric cards ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {metrics.map((m) => {
          const ok = meets(m);
          const unmeasured = m.value == null;
          // Bar is scaled against the target so "how close" is legible; for
          // lower-is-better the fill shrinks as the value improves.
          const pctOfTarget = m.value == null || m.target == null ? 0
            : m.higher_is_better
              ? Math.min(100, (m.value / m.target) * 100)
              : Math.min(100, (m.target / Math.max(m.value, 0.0001)) * 100);
          return (
            <div key={m.key} className="p-4 rounded-xl bg-soc-card border border-soc-border shadow-sm flex flex-col">
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-soc-textMuted">
                  {m.label}
                </span>
                {ok !== null && (
                  <span className={clsx('text-[9px] font-bold px-1.5 py-0.5 rounded uppercase shrink-0',
                    ok ? 'bg-emerald-500/15 text-emerald-500'
                      : 'bg-amber-500/15 text-amber-500')}>
                    {ok ? 'Meets target' : 'Below target'}
                  </span>
                )}
                {unmeasured && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase bg-soc-border/50 text-soc-textMuted shrink-0">
                    Not measured
                  </span>
                )}
              </div>

              <div className="flex items-baseline gap-2">
                <span className={clsx('text-2xl font-extrabold tracking-tight tabular-nums',
                  unmeasured ? 'text-soc-textMuted' : 'text-soc-textPrimary')}>
                  {fmt(m.value, m.unit)}
                </span>
                {m.target != null && (
                  <span className="text-[10px] text-soc-textMuted font-mono">
                    target {m.higher_is_better ? '≥' : '≤'} {fmt(m.target, m.unit)}
                  </span>
                )}
              </div>

              {m.target != null && !unmeasured && (
                <div className="mt-2 h-1.5 rounded-full bg-soc-border overflow-hidden">
                  <div
                    className={clsx('h-full rounded-full transition-all duration-500',
                      ok ? 'bg-emerald-500' : 'bg-amber-500')}
                    style={{ width: `${pctOfTarget}%` }}
                  />
                </div>
              )}

              <p className="text-[10.5px] font-mono text-soc-textSecondary mt-2 break-words">
                {m.basis}
              </p>
              {m.note && (
                <p className="text-[10.5px] text-soc-textMuted mt-1.5 leading-snug">{m.note}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* ── AI contribution ────────────────────────────────────── */}
      {ai && (
        <div className="p-4 rounded-xl bg-soc-card border border-soc-border shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <Cpu className="w-4 h-4 text-soc-accent" />
            <h2 className="text-xs font-bold text-soc-textPrimary uppercase tracking-wider">
              AI contribution and restraint
            </h2>
          </div>
          <p className="text-[11px] text-soc-textSecondary mb-3 max-w-3xl">
            What the model actually added, and how far it was permitted to move a
            score. Reported even when the answer is “nothing” — a system that
            always claims AI value is one whose reliability cannot be calibrated.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              ['Alerts raised by the model', String(ai.alerts_raised)],
              ['Injection attempts blocked', String(ai.injections_blocked)],
              ['Incidents whose score it moved',
                `${ai.incidents_moved} of ${ai.incidents_scored}`],
              ['Mean absolute score change',
                `${ai.mean_abs_delta} pts (clamp +${ai.clamp_up}/−${ai.clamp_down})`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-soc-border bg-soc-bg/40 px-3 py-2">
                <div className="text-[9px] font-bold uppercase tracking-wider text-soc-textMuted">
                  {label}
                </div>
                <div className="text-[12px] font-mono font-semibold text-soc-textPrimary mt-0.5">
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── benchmark table ────────────────────────────────────── */}
      <div className="rounded-xl bg-soc-card border border-soc-border shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-soc-border flex items-center gap-2">
          <Target className="w-3.5 h-3.5 text-soc-textMuted" />
          <h2 className="text-xs font-bold text-soc-textPrimary uppercase tracking-wider">
            Benchmark summary
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11.5px] min-w-[560px]">
            <thead>
              <tr className="text-[9px] uppercase tracking-wider text-soc-textMuted">
                <th className="text-left font-bold px-4 py-2">Metric</th>
                <th className="text-left font-bold px-4 py-2">Measured</th>
                <th className="text-left font-bold px-4 py-2">Target</th>
                <th className="text-left font-bold px-4 py-2">Derived from</th>
                <th className="text-left font-bold px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => {
                const ok = meets(m);
                return (
                  <tr key={m.key} className="border-t border-soc-border/60">
                    <td className="px-4 py-2 text-soc-textPrimary">{m.label}</td>
                    <td className="px-4 py-2 font-mono tabular-nums text-soc-textPrimary">
                      {fmt(m.value, m.unit)}
                    </td>
                    <td className="px-4 py-2 font-mono text-soc-textMuted">
                      {m.target == null ? '—'
                        : `${m.higher_is_better ? '≥' : '≤'} ${fmt(m.target, m.unit)}`}
                    </td>
                    <td className="px-4 py-2 font-mono text-[10.5px] text-soc-textSecondary">
                      {m.basis}
                    </td>
                    <td className="px-4 py-2">
                      {ok === null ? (
                        <span className="text-soc-textMuted">not measured</span>
                      ) : (
                        <span className={clsx('font-semibold flex items-center gap-1',
                          ok ? 'text-emerald-500' : 'text-amber-500')}>
                          {ok ? '● meets target'
                            : <><AlertTriangle className="w-3 h-3" /> below target</>}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {data?.generated_at && (
          <div className="px-4 py-2 border-t border-soc-border text-[10px] font-mono text-soc-textMuted">
            measured {new Date(data.generated_at).toLocaleString()} · re-computed on every load,
            nothing cached
          </div>
        )}
      </div>
    </div>
  );
};

export default PerformanceMatrixPage;
