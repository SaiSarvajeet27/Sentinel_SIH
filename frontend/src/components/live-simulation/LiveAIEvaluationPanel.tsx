import React from 'react';
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Cpu,
  FileSearch,
} from 'lucide-react';
import { LiveAIEvaluation } from '../../types/liveSimulation';

interface Props {
  evaluation: LiveAIEvaluation | null;
  isProcessing?: boolean;
}

export const LiveAIEvaluationPanel: React.FC<Props> = ({ evaluation, isProcessing = false }) => {
  if (!evaluation) {
    return (
      <div className="bg-soc-card border border-soc-border rounded-xl p-5 shadow-sm space-y-3 flex flex-col items-center justify-center min-h-[200px] text-center">
        <div className="p-3 rounded-full bg-soc-secondaryCard text-soc-textMuted border border-soc-border">
          <Sparkles className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <div className="text-xs font-bold text-soc-textPrimary">AI Decision Intelligence Idle</div>
          <p className="text-[11px] text-soc-textSecondary max-w-sm">
            AI investigation synthesizes rule matches, kill-chain calculus, and historical precedents once detection fires.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-soc-card border border-soc-border rounded-xl p-4 shadow-sm space-y-3.5">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-soc-border pb-2.5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-500/15 text-blue-500">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold text-soc-textPrimary">Dual-Path AI Evaluation</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-soc-accent/15 text-soc-accent border border-soc-accent/30">
                Confidence: {evaluation.confidenceScore}% (High)
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-soc-secondaryCard border border-soc-border text-soc-textMuted">
                Simulated AI Verdict
              </span>
            </div>
            <div className="text-[10px] text-soc-textSecondary font-medium mt-0.5">
              {evaluation.threatCategory}
            </div>
          </div>
        </div>

        {/* Confidence Gauge Pill */}
        <div className="flex items-center gap-2 bg-soc-secondaryCard px-2.5 py-1 rounded-lg border border-soc-border text-xs">
          <div className="w-16 h-2 rounded-full bg-soc-card border border-soc-border overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full"
              style={{ width: `${evaluation.confidenceScore}%` }}
            />
          </div>
          <span className="font-mono font-bold text-soc-textPrimary">{evaluation.confidenceScore}%</span>
        </div>
      </div>

      {/* AI Assessment & Root Cause */}
      <div className="p-3 rounded-lg bg-soc-secondaryCard border border-soc-border space-y-2 text-xs">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-soc-textMuted mb-0.5">
            Primary AI Assessment
          </div>
          <div className="text-soc-textPrimary font-semibold leading-relaxed">
            "{evaluation.assessment}"
          </div>
        </div>
        <div className="pt-2 border-t border-soc-border/60 text-[11px] text-soc-textSecondary leading-relaxed">
          <strong className="text-soc-textPrimary">Root Cause: </strong>
          {evaluation.rootCause}
        </div>
      </div>

      {/* Why Act vs Why Wait Dual Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
        {/* Why Act */}
        <div className="p-2.5 rounded-lg bg-red-500/5 border border-red-500/20 space-y-1.5">
          <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400 font-bold text-[11px]">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Why Act Now (Supporting Signals)</span>
          </div>
          <ul className="space-y-1 text-[11px] text-soc-textSecondary">
            {evaluation.whyAct.map((item, idx) => (
              <li key={idx} className="flex items-start gap-1.5 leading-snug">
                <span className="text-red-500 font-bold">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Why Wait / Counter-arguments */}
        <div className="p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20 space-y-1.5">
          <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-bold text-[11px]">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Why Wait (Counter-Arguments / Precedents)</span>
          </div>
          <ul className="space-y-1 text-[11px] text-soc-textSecondary">
            {evaluation.whyWait.map((item, idx) => (
              <li key={idx} className="flex items-start gap-1.5 leading-snug">
                <span className="text-amber-500 font-bold">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Risk if Ignored Alert */}
      <div className="p-2.5 rounded-lg bg-orange-500/10 border border-orange-500/30 flex items-start gap-2 text-xs">
        <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-orange-600 dark:text-orange-400 text-[11px] block">
            Blast Radius Risk If Ignored:
          </span>
          <span className="text-[11px] text-soc-textSecondary leading-snug">
            {evaluation.riskIfIgnored}
          </span>
        </div>
      </div>

      {/* Evidence References */}
      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-soc-border/60 text-[11px]">
        <span className="text-soc-textMuted font-bold flex items-center gap-1">
          <FileSearch className="w-3 h-3" />
          Evidence Anchors:
        </span>
        {evaluation.evidenceReferences.map((ref, i) => (
          <span
            key={i}
            className="px-2 py-0.5 rounded bg-soc-secondaryCard border border-soc-border font-mono text-[10px] text-soc-accent font-semibold"
            title={ref.significance}
          >
            {ref.label}: {ref.refId}
          </span>
        ))}
      </div>
    </div>
  );
};
