import React from 'react';
import { X, Sliders, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { DetectionRule } from '../../types/soc';

interface Props {
  rule: DetectionRule | null;
  isOpen: boolean;
  onClose: () => void;
}

export const RuleDetailModal: React.FC<Props> = ({ rule, isOpen, onClose }) => {
  if (!isOpen || !rule) return null;

  const isNoisy = rule.status === 'NOISY';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200 font-sans text-xs">
      <div className="w-full max-w-xl bg-soc-card border border-soc-border rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="p-5 bg-gradient-to-r from-soc-card via-soc-card to-soc-ai/10 border-b border-soc-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-100 dark:bg-purple-900/60 border border-purple-300 dark:border-purple-700 text-purple-800 dark:text-purple-300">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-soc-textPrimary tracking-wider uppercase">
                  {rule.name}
                </h2>
                <span className="text-[10px] text-soc-textMuted font-mono">({rule.id})</span>
              </div>
              <p className="text-soc-textMuted text-[11px] font-sans">
                Detection Rule Performance & Feedback Analysis
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-soc-secondaryCard hover:bg-soc-cardHover border border-soc-border text-soc-textMuted hover:text-soc-textPrimary transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 font-mono">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-3 gap-3 p-4 rounded-xl bg-soc-secondaryCard border border-soc-border text-center">
            <div>
              <span className="text-[10px] text-soc-textMuted uppercase font-bold block">Status</span>
              <span className={`text-xs font-extrabold px-2 py-0.5 rounded inline-block mt-1 ${
                rule.status === 'HEALTHY'
                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800'
                  : rule.status === 'WATCH'
                  ? 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-400 border border-blue-300 dark:border-blue-800'
                  : rule.status === 'NOISY'
                  ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-400 border border-amber-300 dark:border-amber-800'
                  : 'bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-400 border border-red-300 dark:border-red-800'
              }`}>
                {rule.status.replace(/_/g, ' ')}
              </span>
            </div>

            <div>
              <span className="text-[10px] text-soc-textMuted uppercase font-bold block">FP Rate</span>
              <span className={`text-lg font-extrabold ${rule.falsePositiveRate > 15 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {rule.falsePositiveRate}%
              </span>
            </div>

            <div>
              <span className="text-[10px] text-soc-textMuted uppercase font-bold block">Alert Volume</span>
              <span className="text-lg font-extrabold text-soc-textPrimary">{rule.alertVolume}</span>
            </div>
          </div>

          {/* Reason for Review / Description */}
          {rule.reasonForReview && (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/80 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-amber-700 dark:text-amber-400 text-xs">
                <AlertTriangle className="w-4 h-4" />
                <span>REASON FOR REVIEW:</span>
              </div>
              <p className="text-soc-textSecondary font-sans text-xs leading-relaxed pl-6">
                {rule.reasonForReview}
              </p>
            </div>
          )}

          {/* Override Breakdown */}
          <div className="p-4 rounded-xl bg-soc-secondaryCard border border-soc-border space-y-3">
            <h3 className="text-xs font-bold text-soc-textPrimary uppercase tracking-wider">
              ANALYST DECISION BREAKDOWN
            </h3>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-soc-card border border-soc-border flex items-center justify-between">
                <span className="text-soc-textMuted">Total Overrides:</span>
                <span className="font-bold text-amber-600 dark:text-amber-400">{rule.overrideCount}</span>
              </div>
              <div className="p-3 rounded-lg bg-soc-card border border-soc-border flex items-center justify-between">
                <span className="text-soc-textMuted">Category:</span>
                <span className="font-bold text-soc-ai">{rule.category}</span>
              </div>
            </div>
          </div>

          {/* Recommended Action */}
          <div className="p-4 rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60 space-y-2">
            <div className="flex items-center gap-2 font-bold text-purple-800 dark:text-purple-300 text-xs uppercase">
              <RefreshCw className="w-4 h-4 text-soc-ai" />
              <span>RECOMMENDED RULE ADJUSTMENT:</span>
            </div>
            <p className="text-soc-textSecondary font-sans text-xs leading-relaxed">
              {isNoisy
                ? 'Review rule sensitivity threshold in detection pipeline. Recommend elevating confidence score requirement from 65% to 85% to reduce false alerts on authorized university subnet scans.'
                : 'Rule performing within acceptable precision thresholds. Continue monitoring analyst feedback.'}
            </p>
          </div>

          <div className="p-3 rounded-lg bg-soc-secondaryCard border border-soc-border text-[10px] text-soc-textMuted font-sans">
            <strong>Rule Maintenance Note:</strong> Simulated representation for human analyst rule evaluation.
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-soc-secondaryCard border-t border-soc-border flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-soc-card hover:bg-soc-cardHover border border-soc-border text-soc-textPrimary font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Close Rule Detail</span>
          </button>
        </div>
      </div>
    </div>
  );
};
