import React from 'react';
import { HelpCircle, CheckCircle2, Clock, AlertTriangle, ShieldCheck, History, ArrowRight } from 'lucide-react';
import { useSOC } from '../common/SOCContext';
import { TierBadge } from '../common/TierBadge';
import { AuthorizationTier, ActionAlternative } from '../../types/soc';

interface Props {
  incidentId?: string;
  confidence?: number;
  tier?: AuthorizationTier;
  onSelectAlternative?: (altTitle: string) => void;
}

export const BothSidesDecisionPanel: React.FC<Props> = ({
  incidentId,
  confidence,
  tier,
  onSelectAlternative,
}) => {
  const { getDecisionSupport, aiAnalyses, activeIncidentId, aiEnabled } = useSOC();
  const targetId = incidentId || activeIncidentId;
  const decisionSupport = getDecisionSupport(targetId);
  const aiAnalysis = targetId ? aiAnalyses[targetId] : undefined;
  const displayConfidence = confidence ?? aiAnalysis?.confidence ?? 94;
  const displayTier = tier ?? 'TIER_2';

  if (!aiEnabled) {
    return (
      <div className="p-6 rounded-2xl bg-soc-card border border-soc-border space-y-3 font-sans text-xs text-center">
        <div className="flex items-center justify-center gap-2 text-amber-600 dark:text-amber-400 font-bold text-sm">
          <AlertTriangle className="w-5 h-5" />
          <span>AI DECISION ASSISTANCE DISABLED</span>
        </div>
        <p className="text-soc-textMuted font-sans max-w-md mx-auto text-xs">
          AI assistance is currently disabled. System telemetry, attack graph correlation, tier governance rules, and human approval queue remain 100% active.
        </p>
      </div>
    );
  }

  const precedent = decisionSupport.historicalPrecedent;

  return (
    <div className="p-5 rounded-xl bg-soc-card border border-soc-border space-y-4 font-sans text-xs shadow-soc-card">
      {/* Panel Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-soc-border pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-950/60 border border-purple-300 dark:border-purple-800 text-purple-800 dark:text-purple-300">
            <HelpCircle className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-extrabold text-soc-textPrimary tracking-wider uppercase">
              AI Decision Intelligence — Both-Sides Support
            </h2>
            <p className="text-soc-textMuted text-[10px]">
              Balanced Operational Analysis for Target Recommendation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950/80 border border-purple-300 dark:border-purple-700 text-purple-800 dark:text-purple-300 text-[11px] font-bold">
            {displayConfidence}% AI Confidence
          </span>
          <TierBadge tier={displayTier} size="sm" />
        </div>
      </div>

      {/* WHY ACT vs WHY WAIT Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* WHY ACT? */}
        <div className="p-3.5 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/80 space-y-2.5">
          <div className="flex items-center gap-2 font-bold text-emerald-700 dark:text-emerald-400 text-xs uppercase tracking-wider">
            <CheckCircle2 className="w-4 h-4" />
            <span>WHY ACT? (CONTAINMENT RATIONALE)</span>
          </div>

          <ul className="space-y-1.5 text-soc-textSecondary font-sans text-xs">
            {decisionSupport.whyAct.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2 bg-soc-card p-2.5 rounded-lg border border-soc-border">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                <span className="text-soc-textSecondary">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* WHY WAIT? */}
        <div className="p-3.5 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/80 space-y-2.5">
          <div className="flex items-center gap-2 font-bold text-amber-700 dark:text-amber-400 text-xs uppercase tracking-wider">
            <Clock className="w-4 h-4" />
            <span>WHY WAIT? (OPERATIONAL DISRUPTION)</span>
          </div>

          <ul className="space-y-1.5 text-soc-textSecondary font-sans text-xs">
            {decisionSupport.whyWait.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2 bg-soc-card p-2.5 rounded-lg border border-soc-border">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                <span className="text-soc-textSecondary">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* RISK IF IGNORED */}
      <div className="p-3 rounded-lg bg-red-50/50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/80 space-y-1">
        <div className="flex items-center gap-2 font-bold text-red-700 dark:text-red-400 text-xs uppercase tracking-wider">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>RISK IF IGNORED:</span>
        </div>
        <p className="text-soc-textSecondary font-sans text-xs leading-relaxed pl-5">
          {decisionSupport.riskIfIgnored}
        </p>
      </div>

      {/* ALTERNATIVES SECTION */}
      <div className="space-y-2.5 pt-1">
        <h3 className="text-xs font-bold text-soc-textPrimary uppercase tracking-wider flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-soc-cyan" />
          RESPONSE ALTERNATIVES COMPARISON
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {decisionSupport.alternatives.map((alt: ActionAlternative) => (
            <div
              key={alt.id}
              className="p-3 rounded-lg bg-soc-secondaryCard border border-soc-border hover:border-soc-borderLight transition-all flex flex-col justify-between space-y-2"
            >
              <div>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="font-bold text-soc-textPrimary text-xs truncate">{alt.title}</span>
                  <TierBadge tier={alt.tier} size="sm" showLabel={false} />
                </div>
                <p className="text-soc-textMuted font-sans text-[11px] line-clamp-2">{alt.description}</p>
              </div>

              <div className="p-2 rounded bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-[10px] text-amber-800 dark:text-amber-300 font-sans">
                <strong>Trade-off:</strong> {alt.tradeOff}
              </div>

              {onSelectAlternative && (
                <button
                  onClick={() => onSelectAlternative(alt.title)}
                  className="w-full py-1.5 rounded bg-cyan-100 dark:bg-cyan-950/80 hover:bg-cyan-200 dark:hover:bg-cyan-900 border border-cyan-300 dark:border-cyan-800 text-cyan-800 dark:text-cyan-300 font-bold text-[10px] flex items-center justify-center gap-1 transition-colors cursor-pointer"
                >
                  <span>OVERRIDE WITH THIS</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* HISTORICAL PRECEDENT WIDGET */}
      <div className="p-3.5 rounded-lg bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800/60 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <History className="w-4 h-4 text-soc-ai shrink-0" />
          <div>
            <span className="text-[9px] text-purple-800 dark:text-purple-400 font-bold uppercase tracking-wider block">Historical Precedent Index</span>
            <div className="text-soc-textPrimary font-bold text-xs mt-0.5">
              Similar Incidents Evaluated: <strong className="text-soc-ai">{precedent.totalSimilar}</strong>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="text-center">
            <span className="text-[9px] text-soc-textMuted uppercase block font-bold">Isolated</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400 text-xs">{precedent.isolatedCount}</span>
          </div>
          <div className="text-center border-l border-soc-border pl-3">
            <span className="text-[9px] text-soc-textMuted uppercase block font-bold">Alternatives</span>
            <span className="font-bold text-blue-600 dark:text-blue-400 text-xs">{precedent.alternativeCount}</span>
          </div>
          <div className="text-center border-l border-soc-border pl-3">
            <span className="text-[9px] text-soc-textMuted uppercase block font-bold">Containment Rate</span>
            <span className="font-bold text-soc-cyan text-xs">{precedent.successRate}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
