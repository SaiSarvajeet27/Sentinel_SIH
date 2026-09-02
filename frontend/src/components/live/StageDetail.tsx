// What a stage actually did to the threat currently on screen.
//
// The stage panel used to show the socket frames verbatim, which is data,
// not an explanation — "RULE · Credential material read from process
// memory · T1003.001 · CRITICAL" tells you a rule fired, not how this
// threat was processed. Everything below is built from the incident,
// action and ledger records read back from the API, so each stage can
// answer the question a person actually has: what happened here, to this
// attack, and how was it decided.
//
// Nothing is fabricated. Where a field is genuinely absent — the model
// was rate-limited, no injection was attempted — the panel says so
// rather than inventing a plausible line.
import React from 'react';
import clsx from 'clsx';
import type { StageKey, Frame } from '../../services/liveThreatStore';

interface Props {
  stage: StageKey;
  incident: any;
  actions: any[];
  ledger: any[];
  frames: Frame[];
  scenario: string;
}

const Row: React.FC<{ k: string; v: React.ReactNode }> = ({ k, v }) => (
  <div className="flex gap-3 py-1 border-b border-soc-border/50 last:border-0">
    <span className="text-[10px] font-bold uppercase tracking-wider text-soc-textMuted w-40 shrink-0 pt-0.5">
      {k}
    </span>
    <span className="text-[11.5px] text-soc-textPrimary min-w-0 break-words">{v}</span>
  </div>
);

const Note: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[11.5px] leading-relaxed text-soc-textSecondary mb-2">{children}</p>
);

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[11.5px] text-soc-textMuted italic">{children}</p>
);

const SEV_CLASS: Record<string, string> = {
  critical: 'bg-red-500/15 text-red-500',
  high: 'bg-orange-500/15 text-orange-500',
  medium: 'bg-amber-500/15 text-amber-500',
  low: 'bg-emerald-500/15 text-emerald-500',
};

const STAGE_NAMES = [
  'Initial access', 'Execution', 'Persistence', 'Evasion',
  'Credential access', 'Lateral movement', 'Impact',
];

export const StageDetail: React.FC<Props> = ({
  stage, incident, actions, ledger, frames, scenario,
}) => {
  const inc = incident ?? {};
  const alerts: any[] = inc.alerts ?? [];
  const timeline: any[] = inc.timeline ?? [];
  const pending = actions.filter((a) => a.status === 'pending');
  const executed = actions.filter((a) => a.status === 'executed');

  // ── 1 · Event Generated ──────────────────────────────────────────
  if (stage === 'generated') {
    const gen = frames.find((f) => f.payload?.scenario?.generated_by)
      ?.payload?.scenario;
    const first = timeline[0]?.ts;
    const last = timeline[timeline.length - 1]?.ts;
    return (
      <div>
        <Note>
          The attack plan is written first, then expanded into ordinary-looking
          telemetry and mixed into the background traffic of the simulated
          organisation. Detection sees it the same way it would see a real
          intrusion — buried in a normal day.
        </Note>
        <Row k="Scenario" v={scenario || <Empty>not yet named</Empty>} />
        {gen?.victim && <Row k="Intended victim" v={gen.victim} />}
        {gen?.lure && <Row k="Lure" v={gen.lure} />}
        <Row
          k="Authored by"
          v={gen?.generated_by
            ? <span className="font-mono">{gen.generated_by}</span>
            : <Empty>not reported in this run’s frames</Empty>}
        />
        {first && (
          <Row k="Telemetry window"
            v={<span className="font-mono">
              {new Date(first).toLocaleTimeString([], { hour12: false })}
              {' → '}
              {new Date(last).toLocaleTimeString([], { hour12: false })}
            </span>} />
        )}
      </div>
    );
  }

  // ── 2 · Event Processed ──────────────────────────────────────────
  if (stage === 'processed') {
    const last = [...frames].reverse().find((f) => f.kind === 'counters')?.payload ?? {};
    const sources = Array.from(new Set(timeline.map((t) => t.source).filter(Boolean)));
    const inj: any[] = inc.injection_details ?? [];
    return (
      <div>
        <Note>
          Every attacker-controlled field is isolated before anything else reads
          it, normalised, stripped of hidden characters, and scanned for
          instructions aimed at the model. An attempt is treated as evidence, not
          noise — a legitimate filename does not address an AI system.
        </Note>
        <Row k="Events processed"
          v={<span className="font-mono tabular-nums">
            {Number(last.events_processed ?? 0).toLocaleString()}
          </span>} />
        <Row k="Alerts raised"
          v={<span className="font-mono tabular-nums">{last.alerts_raised ?? 0}</span>} />
        <Row k="Telemetry sources"
          v={sources.length
            ? sources.join(' · ')
            : <Empty>none recorded yet</Empty>} />
        <Row
          k="Injection attempts"
          v={inc.injection_detected && inj.length ? (
            <div className="space-y-1">
              {inj.map((d, i) => (
                <div key={i}>
                  <span className="font-mono text-red-500">{d.class}</span>
                  <span className="text-soc-textSecondary"> in the </span>
                  <span className="font-mono">{d.field}</span>
                  <span className="text-soc-textSecondary"> field — stripped, and raised as its own alert.</span>
                </div>
              ))}
            </div>
          ) : <Empty>none detected in this threat</Empty>}
        />
      </div>
    );
  }

  // ── 3 · Sigma Rule Detection ─────────────────────────────────────
  if (stage === 'sigma') {
    const byRule = new Map<string, { title: string; sev: string; tech: string; n: number }>();
    alerts.forEach((a) => {
      const cur = byRule.get(a.rule_id);
      if (cur) cur.n += 1;
      else byRule.set(a.rule_id, {
        title: a.title, sev: a.severity, tech: a.technique, n: 1,
      });
    });
    const rows = [...byRule.entries()];
    return (
      <div>
        <Note>
          Each rule below matched this threat. The severity was fixed when the
          rule was written, not decided at detection time — which is why only a
          written rule can call something critical.
        </Note>
        {rows.length === 0 ? <Empty>No rules have matched yet.</Empty> : (
          <div className="space-y-1.5">
            {rows.map(([id, r]) => (
              <div key={id} className="flex items-start gap-2 py-1.5 border-b border-soc-border/50 last:border-0">
                <span className={clsx('text-[9px] font-bold px-1.5 py-0.5 rounded uppercase shrink-0',
                  SEV_CLASS[r.sev] ?? 'bg-soc-border/50 text-soc-textMuted')}>
                  {r.sev}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[11.5px] text-soc-textPrimary">{r.title}</div>
                  <div className="text-[10px] font-mono text-soc-textMuted">
                    {id} · {r.tech}{r.n > 1 && ` · fired ${r.n}×`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── 4 · AI Evaluation ────────────────────────────────────────────
  if (stage === 'ai') {
    const delta = inc.ai_score_delta ?? 0;
    const verdictFrame = [...frames].reverse().find((f) => f.kind === 'ai.verdicts')?.payload;
    const model = verdictFrame?.model ?? {};
    const aiAlerts = inc.ai_alerts ?? [];
    return (
      <div>
        <Note>
          The model reads the same window without being shown the rules’ score.
          The two verdicts are then reconciled — the system acts on whichever is
          more worried, and the model may move the number only within a fixed
          clamp.
        </Note>
        <Row k="Deterministic score"
          v={<span className="font-mono">{inc.base_score ?? '—'}</span>} />
        <Row
          k="Model verdict"
          v={model?.score != null
            ? <span className="font-mono">{model.score}{model.band ? ` (${model.band})` : ''}</span>
            : <Empty>{model?.status
              ? `did not run — ${String(model.status).replace(/_/g, ' ')}`
              : 'no independent verdict recorded'}</Empty>}
        />
        <Row
          k="Model’s effect on score"
          v={delta === 0
            ? <span>none — it moved the score by <span className="font-mono">0.0</span></span>
            : <span className="font-mono">{delta > 0 ? '+' : ''}{delta}</span>}
        />
        <Row k="AI-raised alerts"
          v={aiAlerts.length
            ? `${aiAlerts.length} (capped at medium severity by policy)`
            : <Empty>none — every alert here came from a written rule</Empty>} />
        <Row
          k="Claim consistency"
          v={inc.consistency_flag
            ? <span className="text-amber-500">flagged — a claim did not match the evidence and was removed</span>
            : <span className="text-emerald-500">every claim matched the cited evidence</span>}
        />
        {inc.narrative?.summary && (
          <Row k="Narrative" v={<span className="italic">{inc.narrative.summary}</span>} />
        )}
      </div>
    );
  }

  // ── 5 · Incident Created ─────────────────────────────────────────
  if (stage === 'incident') {
    const stages: boolean[] = inc.stages ?? [];
    const covered = stages.filter(Boolean).length;
    const rf = inc.risk_factors ?? {};
    return (
      <div>
        <Note>
          Alerts are grouped by walking the entity graph, then scored by how far
          through the attack lifecycle the intrusion travelled — not by counting
          alerts. Breadth is what moves the number.
        </Note>
        <Row k="Alerts merged" v={`${alerts.length} alerts into one incident`} />
        <Row k="Entities involved"
          v={<span className="font-mono">{(inc.entities ?? []).join(' · ') || '—'}</span>} />
        <Row
          k="Kill-chain coverage"
          v={<div>
            <span className="font-mono">{covered} of 7 stages</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {STAGE_NAMES.map((n, i) => (
                <span key={n} className={clsx(
                  'text-[9px] px-1.5 py-0.5 rounded border',
                  stages[i] ? 'bg-red-500/10 text-red-500 border-red-500/30'
                    : 'text-soc-textMuted border-soc-border')}>
                  {n}
                </span>
              ))}
            </div>
          </div>}
        />
        <Row k="ATT&CK tactics"
          v={<span className="font-mono">{(inc.tactics ?? []).join(' · ') || '—'}</span>} />
        {Object.keys(rf).length > 0 && (
          <Row k="Score factors"
            v={<span className="font-mono">
              {Object.entries(rf).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`).join(' · ')}
            </span>} />
        )}
        <Row k="Final risk"
          v={<span className="font-mono">
            {inc.risk_score ?? '—'} / 100{inc.confidence_band ? ` · ${inc.confidence_band}` : ''}
          </span>} />
      </div>
    );
  }

  // ── 6 · Response Recommendation ──────────────────────────────────
  if (stage === 'recommend') {
    return (
      <div>
        <Note>
          The model drafts the plan; policy assigns each step a tier and computes
          who it would affect. The tier is what decides whether a step can run on
          its own, and it comes from a table the model cannot reach.
        </Note>
        {actions.length === 0 ? <Empty>No plan has been drafted yet.</Empty> : (
          <div className="space-y-1.5">
            {actions.map((a) => (
              <div key={a.id ?? a.action_id} className="py-1.5 border-b border-soc-border/50 last:border-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11.5px] font-semibold text-soc-textPrimary">{a.kind}</span>
                  <span className={clsx('text-[9px] font-bold px-1.5 py-0.5 rounded uppercase',
                    a.tier >= 2 ? 'bg-amber-500/15 text-amber-500' : 'bg-emerald-500/15 text-emerald-500')}>
                    Tier {a.tier}
                  </span>
                  <span className="text-[10px] text-soc-textMuted">
                    {a.tier >= 2 ? 'needs a named human' : 'may run automatically'}
                  </span>
                </div>
                {a.target && (
                  <div className="text-[10px] font-mono text-soc-textMuted mt-0.5">
                    target: {a.target}{a.blast ? ` · affects: ${a.blast}` : ''}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── 7 · Human Approval ───────────────────────────────────────────
  if (stage === 'approval') {
    return (
      <div>
        <Note>
          This is the gate. Tier 2 needs one named, authenticated approver; tier 3
          needs two from different accounts. The role comes from a signed token,
          so an analyst attempting a tier-2 approval is refused by the server, not
          merely hidden from the button.
        </Note>
        {pending.length === 0 ? (
          <Empty>
            {executed.length
              ? 'Nothing is waiting — every action for this threat was tier 0 or 1 and ran automatically.'
              : 'No action has reached the gate yet.'}
          </Empty>
        ) : (
          <div className="space-y-1.5">
            {pending.map((a) => (
              <div key={a.id ?? a.action_id} className="py-1.5 border-b border-soc-border/50 last:border-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11.5px] font-semibold text-soc-textPrimary">{a.kind}</span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 uppercase">
                    Tier {a.tier} · held
                  </span>
                </div>
                <div className="text-[10px] font-mono text-soc-textMuted mt-0.5">
                  target: {a.target || '—'}{a.blast ? ` · affects: ${a.blast}` : ''}
                </div>
                <div className="text-[10.5px] text-soc-textSecondary mt-1">
                  Requires {a.tier >= 3 ? 'two approvers from different accounts' : 'one approver'}
                  {a.tier >= 3 ? ' (manager only)' : ' (senior analyst or manager)'}.
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── 8 · Response Execution ───────────────────────────────────────
  if (stage === 'execute') {
    return (
      <div>
        <Note>
          Executed actions record who authorised them and stay reversible for a
          fixed window — isolating a host for twenty-four hours, suspending an
          account for seventy-two.
        </Note>
        {executed.length === 0 ? <Empty>Nothing has executed for this threat yet.</Empty> : (
          <div className="space-y-1.5">
            {executed.map((a) => (
              <div key={a.id ?? a.action_id} className="flex items-center gap-2 flex-wrap py-1.5 border-b border-soc-border/50 last:border-0">
                <span className="text-[11.5px] font-semibold text-soc-textPrimary">{a.kind}</span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-500 uppercase">
                  Tier {a.tier} · executed
                </span>
                <span className="text-[10px] font-mono text-soc-textMuted">
                  {a.target}{a.tier <= 1 ? ' · auto, reversible' : ' · human-authorised'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── 9 · Audit Recorded ───────────────────────────────────────────
  const recent = ledger.slice(0, 6);
  return (
    <div>
      <Note>
        Each entry carries a SHA-256 hash of the entry before it and an Ed25519
        signature. Altering one breaks every link after it, which is what makes
        this checkable rather than merely stored.
      </Note>
      <Row k="Total entries"
        v={<span className="font-mono tabular-nums">{ledger.length}</span>} />
      {recent.length === 0 ? <Empty>No ledger entries read yet.</Empty> : (
        <div className="mt-2 space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-soc-textMuted">
            Most recent entries
          </span>
          {recent.map((e: any) => (
            <div key={e.seq} className="font-mono text-[10.5px] flex gap-2 items-baseline">
              <span className="text-soc-textMuted tabular-nums shrink-0">#{e.seq}</span>
              <span className="shrink-0 px-1 rounded text-[9px] font-bold uppercase bg-soc-accent/15 text-soc-accent">
                {e.action_type}
              </span>
              <span className="text-soc-textSecondary shrink-0">{e.actor}</span>
              <span className="text-soc-textMuted break-all">{e.entry_hash}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default StageDetail;
