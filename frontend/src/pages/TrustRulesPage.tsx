import React, { useState } from 'react';
import {
  Sliders,
  AlertTriangle,
  Trash2,
  History,
  ShieldCheck,
  AlertOctagon,
  GitCompare,
  Lock,
  CheckCircle2,
  MessageSquare,
  Edit3,
} from 'lucide-react';
import { useSOC } from '../components/common/SOCContext';
import { DetectionRule, Severity } from '../types/soc';
import { RuleDetailModal } from '../components/rules/RuleDetailModal';
import { RuleRetirementModal } from '../components/rules/RuleRetirementModal';
import { PromptInjectionCard } from '../components/ai-safety/PromptInjectionCard';
import { ConflictingAlertCard } from '../components/ai-safety/ConflictingAlertCard';
import { FeedbackStats } from '../components/feedback/FeedbackStats';
import { FeedbackModal } from '../components/feedback/FeedbackModal';
import { TrustScoreCard } from '../components/trust/TrustScoreCard';

type SubTab = 'rules' | 'safety' | 'feedback';

// One merged page instead of three separate ones, each rendered a tab at a
// time rather than stacked — this used to be three full-height pages with
// their own header banners, KPI strips and tables all piled vertically.
export const TrustRulesPage: React.FC = () => {
  const {
    detectionRules, ruleOverrides, safetyEvents,
    feedbackList, feedbackStats, submitAnalystFeedback, activeIncident, aiAnalyses,
  } = useSOC();

  const [tab, setTab] = useState<SubTab>('rules');
  const [selectedRule, setSelectedRule] = useState<DetectionRule | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [retirementRule, setRetirementRule] = useState<DetectionRule | null>(null);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);

  const noisyRules = detectionRules.filter((r) => r.status === 'NOISY');
  const retirementCandidates = detectionRules.filter((r) => r.status === 'RETIREMENT_CANDIDATE');
  const promptInjections = safetyEvents.filter((e) => e.type === 'PROMPT_INJECTION');
  const conflictingAlerts = safetyEvents.filter((e) => e.type !== 'PROMPT_INJECTION');

  const mainInc = activeIncident || { id: '', title: 'No incident selected', severity: 'MEDIUM' as Severity };
  const currentAnalysis = aiAnalyses[mainInc.id];

  const handleSubmitFeedback = (
    decision: 'CONFIRM' | 'FALSE_POSITIVE' | 'MODIFY',
    reason?: string,
    newSeverity?: Severity
  ) => {
    submitAnalystFeedback({
      id: `FBD-${Date.now().toString().slice(-4)}`,
      incidentId: mainInc.id,
      incidentTitle: mainInc.title,
      decision,
      originalSeverity: mainInc.severity,
      newSeverity,
      reason,
      analystId: 'Analyst',
      createdAt: new Date().toISOString(),
    });
    setIsFeedbackModalOpen(false);
  };

  const TABS: { id: SubTab; label: string; icon: typeof Sliders; count?: number }[] = [
    { id: 'rules', label: 'Detection Rules', icon: Sliders, count: detectionRules.length || undefined },
    { id: 'safety', label: 'AI Safety', icon: ShieldCheck, count: safetyEvents.length || undefined },
    { id: 'feedback', label: 'Analyst Feedback', icon: MessageSquare, count: feedbackStats.totalSubmitted || undefined },
  ];

  return (
    <div className="space-y-5 font-sans">
      {/* One shared header instead of three */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 p-4 rounded-xl bg-soc-card border border-soc-border flex items-center shadow-soc-card">
          <div>
            <h1 className="text-lg font-extrabold text-soc-textPrimary tracking-tight">
              Trust, Rules &amp; Safety
            </h1>
            <p className="text-[11px] text-soc-textMuted mt-0.5">
              Detection rule performance, AI guardrails, and the analyst feedback loop that calibrates both —
              per-tab counts are on the tabs below.
            </p>
          </div>
        </div>
        <TrustScoreCard />
      </div>

      {/* Sub-tabs — only one section's content renders at a time */}
      <div className="flex border-b border-soc-border gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
              tab === t.id
                ? 'border-soc-accent text-soc-accent bg-soc-accent/10 font-bold'
                : 'border-transparent text-soc-textSecondary hover:text-soc-textPrimary hover:bg-soc-cardHover'
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            <span>{t.label}</span>
            {t.count !== undefined && (
              <span className="px-1.5 py-0.5 rounded bg-soc-secondaryCard border border-soc-border text-soc-textSecondary text-[9px]">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── DETECTION RULES ─────────────────────────────────────────── */}
      {tab === 'rules' && (
        <div className="space-y-5">
          {retirementCandidates.length > 0 && (
            <div className="p-4 rounded-xl bg-gradient-to-r from-red-500/10 via-soc-card to-soc-card border border-red-200 dark:border-red-800/80 space-y-3 shadow-soc-card">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-bold text-xs uppercase tracking-wider">
                <AlertTriangle className="w-4 h-4" />
                <span>Retirement candidates</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {retirementCandidates.map((rule) => (
                  <div key={rule.id} className="p-3.5 rounded-lg bg-soc-card border border-red-200 dark:border-red-900/60 space-y-2.5 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-bold text-soc-textPrimary text-xs">{rule.name}</span>
                        <span className="px-2 py-0.2 rounded text-[9px] font-bold bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-400 border border-red-200 dark:border-red-800">
                          FP Rate: {rule.falsePositiveRate}%
                        </span>
                      </div>
                      <p className="text-soc-textSecondary font-sans text-xs">{rule.reasonForReview}</p>
                      <div className="flex items-center gap-3 text-[10px] text-soc-textMuted mt-2 font-mono">
                        <span>Alerts: <strong>{rule.alertVolume}</strong></span>
                        <span>Overrides: <strong>{rule.overrideCount}</strong></span>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-soc-border">
                      <button
                        onClick={() => setRetirementRule(rule)}
                        className="w-full py-1.5 rounded-lg bg-red-100 dark:bg-red-950 hover:bg-red-200 dark:hover:bg-red-900 border border-red-300 dark:border-red-800 text-red-800 dark:text-red-300 font-bold text-xs shadow-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Review retirement</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="p-4 rounded-xl bg-soc-card border border-soc-border space-y-3 shadow-soc-card">
            <div className="flex items-center justify-between border-b border-soc-border pb-3">
              <h2 className="text-xs font-bold text-soc-textPrimary uppercase tracking-wider flex items-center gap-2">
                <Sliders className="w-4 h-4 text-soc-cyan" />
                Active detection rules ({noisyRules.length} noisy)
              </h2>
              <span className="text-soc-textMuted text-xs font-sans">Click a row for details</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr className="border-b border-soc-border text-soc-textMuted uppercase text-[10px] bg-soc-secondaryCard/80">
                    <th className="p-2.5">Rule</th>
                    <th className="p-2.5">Category</th>
                    <th className="p-2.5">FP Rate</th>
                    <th className="p-2.5">Alerts</th>
                    <th className="p-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-soc-border">
                  {detectionRules.map((rule) => (
                    <tr key={rule.id} onClick={() => { setSelectedRule(rule); setIsDetailOpen(true); }}
                        className="hover:bg-soc-cardHover transition-colors cursor-pointer">
                      <td className="p-2.5">
                        <div className="font-bold text-soc-textPrimary text-xs">{rule.name}</div>
                        <div className="text-[10px] text-soc-cyan font-mono">{rule.id}</div>
                      </td>
                      <td className="p-2.5">
                        <span className="px-2 py-0.5 rounded bg-soc-secondaryCard border border-soc-border text-soc-textSecondary text-[10px]">{rule.category}</span>
                      </td>
                      <td className="p-2.5">
                        <span className={`font-bold ${rule.falsePositiveRate > 15 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{rule.falsePositiveRate}%</span>
                      </td>
                      <td className="p-2.5 text-soc-textPrimary font-bold">{rule.alertVolume}</td>
                      <td className="p-2.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          rule.status === 'HEALTHY' ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800'
                          : rule.status === 'WATCH' ? 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-400 border-blue-300 dark:border-blue-800'
                          : rule.status === 'NOISY' ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-400 border-amber-300 dark:border-amber-800'
                          : rule.status === 'RETIREMENT_CANDIDATE' ? 'bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-400 border-red-300 dark:border-red-800'
                          : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-gray-400 border-slate-300 dark:border-slate-700'
                        }`}>{rule.status.replace(/_/g, ' ')}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {ruleOverrides.length > 0 && (
            <div className="p-4 rounded-xl bg-soc-card border border-soc-border space-y-3 shadow-soc-card">
              <h2 className="text-xs font-bold text-soc-textPrimary uppercase tracking-wider flex items-center gap-2 border-b border-soc-border pb-3">
                <History className="w-4 h-4 text-soc-cyan" />
                Override history
              </h2>
              <div className="space-y-2.5">
                {ruleOverrides.slice(0, 8).map((ovr) => (
                  <div key={ovr.id} className="p-3 rounded-lg bg-soc-secondaryCard border border-soc-border text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-soc-textPrimary">{ovr.ruleName || ovr.aiAction}</span>
                      <span className="text-soc-textMuted text-[10px] font-mono">{ovr.timestamp?.slice(0, 16)}</span>
                    </div>
                    <div className="text-soc-textSecondary font-sans mt-1">
                      AI proposed <strong className="text-purple-600 dark:text-purple-400">{ovr.aiAction}</strong>, analyst chose <strong className="text-cyan-600 dark:text-cyan-400">{ovr.humanAction}</strong> — {ovr.reason}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── AI SAFETY ────────────────────────────────────────────────── */}
      {tab === 'safety' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            <div className="p-3.5 rounded-xl bg-soc-card border border-soc-border space-y-1 shadow-soc-card">
              <div className="text-[9px] text-soc-ai font-bold uppercase">Prompt injection attempts</div>
              <div className="text-2xl font-black text-soc-textPrimary">{promptInjections.length}</div>
              <div className="text-emerald-600 dark:text-emerald-400 text-[10px] flex items-center gap-1 font-bold">
                <CheckCircle2 className="w-3 h-3" /> Blocked at the boundary
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-soc-card border border-soc-border space-y-1 shadow-soc-card">
              <div className="text-[9px] text-amber-600 dark:text-amber-400 font-bold uppercase">Conflicting / poisoned signals</div>
              <div className="text-2xl font-black text-soc-textPrimary">{conflictingAlerts.length}</div>
              <div className="text-amber-600 dark:text-amber-400 text-[10px] font-bold">Forced to human review</div>
            </div>
            <div className="p-3.5 rounded-xl bg-soc-card border border-soc-border space-y-1 shadow-soc-card">
              <div className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold uppercase">Guardrail status</div>
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5"><Lock className="w-4 h-4" />ACTIVE</div>
            </div>
          </div>

          {promptInjections.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-xs font-bold text-soc-textPrimary uppercase tracking-wider flex items-center gap-2">
                <AlertOctagon className="w-3.5 h-3.5 text-soc-ai" />
                Prompt injection defense
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {promptInjections.map((evt) => <PromptInjectionCard key={evt.id} event={evt} />)}
              </div>
            </div>
          )}

          {conflictingAlerts.length > 0 && (
            <div className="space-y-3 pt-3 border-t border-soc-border">
              <h2 className="text-xs font-bold text-soc-textPrimary uppercase tracking-wider flex items-center gap-2">
                <GitCompare className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                Conflicting &amp; poisoned alert resolution
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {conflictingAlerts.map((evt) => <ConflictingAlertCard key={evt.id} event={evt} />)}
              </div>
            </div>
          )}

          {safetyEvents.length === 0 && (
            <div className="p-8 text-center rounded-xl bg-soc-card border border-soc-border text-soc-textMuted text-xs">
              No AI safety events yet — these appear once a demo run reaches the injection or disagreement steps.
            </div>
          )}
        </div>
      )}

      {/* ── ANALYST FEEDBACK ─────────────────────────────────────────── */}
      {tab === 'feedback' && (
        <div className="space-y-5">
          <FeedbackStats stats={feedbackStats} />

          <div className="p-4 rounded-xl bg-soc-card border border-soc-border space-y-3 text-xs shadow-soc-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-soc-border pb-2.5">
              <div>
                <span className="text-[9px] text-soc-textMuted font-bold uppercase">Current AI decision</span>
                <h3 className="text-sm font-bold text-soc-textPrimary">{mainInc.id ? `${mainInc.id}: ${mainInc.title}` : mainInc.title}</h3>
              </div>
              {currentAnalysis && (
                <span className="px-2.5 py-0.5 rounded bg-purple-100 dark:bg-purple-950 border border-purple-300 dark:border-purple-800 text-purple-800 dark:text-purple-300 font-bold text-[10px]">
                  AI Confidence: {currentAnalysis.confidence}%
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button onClick={() => handleSubmitFeedback('CONFIRM')} disabled={!mainInc.id}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold flex items-center gap-1.5 shadow-sm text-xs transition-all cursor-pointer">
                <CheckCircle2 className="w-3.5 h-3.5" /><span>Confirm threat</span>
              </button>
              <button onClick={() => setIsFeedbackModalOpen(true)} disabled={!mainInc.id}
                className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-bold flex items-center gap-1.5 shadow-sm text-xs transition-all cursor-pointer">
                <AlertTriangle className="w-3.5 h-3.5" /><span>Flag false positive</span>
              </button>
              <button onClick={() => setIsFeedbackModalOpen(true)} disabled={!mainInc.id}
                className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white font-bold flex items-center gap-1.5 shadow-sm text-xs transition-all cursor-pointer">
                <Edit3 className="w-3.5 h-3.5" /><span>Modify severity</span>
              </button>
              {!mainInc.id && <span className="text-soc-textMuted text-[11px]">Select an incident first.</span>}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-soc-card border border-soc-border space-y-3 shadow-soc-card">
            <h3 className="text-xs font-bold text-soc-textPrimary uppercase tracking-wider">Feedback history</h3>
            <div className="space-y-2.5 font-mono text-xs">
              {feedbackList.slice(0, 15).map((fb) => (
                <div key={fb.id} className="p-3 rounded-lg bg-soc-secondaryCard border border-soc-border flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-soc-cyan">{fb.id}</span>
                      <span className="text-soc-textMuted">• {fb.incidentId}</span>
                      <span className={`px-2 py-0.2 rounded text-[9px] font-bold ${
                        fb.decision === 'CONFIRM' ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800'
                        : fb.decision === 'FALSE_POSITIVE' ? 'bg-red-100 dark:bg-red-950/80 text-red-800 dark:text-red-400 border border-red-300 dark:border-red-800'
                        : 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                      }`}>{fb.decision}</span>
                    </div>
                    <div className="text-soc-textPrimary font-bold text-xs mt-1">{fb.incidentTitle}</div>
                  </div>
                  <div className="text-right text-[10px] text-soc-textMuted shrink-0">
                    <div>{fb.analystId}</div>
                    <div>{fb.createdAt?.slice(0, 16)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <RuleDetailModal rule={selectedRule} isOpen={isDetailOpen} onClose={() => setIsDetailOpen(false)} />
      <RuleRetirementModal rule={retirementRule} isOpen={!!retirementRule} onClose={() => setRetirementRule(null)} />
      {mainInc.id && (
        <FeedbackModal isOpen={isFeedbackModalOpen} incidentId={mainInc.id} onClose={() => setIsFeedbackModalOpen(false)} onSubmit={handleSubmitFeedback} />
      )}
    </div>
  );
};
