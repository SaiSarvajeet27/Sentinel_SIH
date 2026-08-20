import React from 'react';
import { X, AlertOctagon, Trash2, ShieldCheck } from 'lucide-react';
import { DetectionRule } from '../../types/soc';
import { useSOC } from '../common/SOCContext';

interface Props {
  rule: DetectionRule | null;
  isOpen: boolean;
  onClose: () => void;
}

export const RuleRetirementModal: React.FC<Props> = ({ rule, isOpen, onClose }) => {
  const { retireRule, keepRule } = useSOC();

  if (!isOpen || !rule) return null;

  const handleRetire = () => {
    retireRule(rule.id);
    onClose();
  };

  const handleKeep = () => {
    keepRule(rule.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200 font-sans text-xs">
      <div className="w-full max-w-lg bg-soc-card border border-red-800/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="p-5 bg-gradient-to-r from-soc-card via-soc-card to-red-500/10 border-b border-soc-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-red-100 dark:bg-red-900/60 border border-red-300 dark:border-red-700 text-red-800 dark:text-red-300 shadow-sm dark:shadow-glow-red">
              <AlertOctagon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-soc-textPrimary tracking-wider uppercase">
                REVIEW RULE RETIREMENT
              </h2>
              <p className="text-soc-textMuted text-[11px] font-sans">
                Human Governance Authorization Interlock
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
          <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/80 space-y-2">
            <div className="text-soc-textPrimary font-bold text-sm">
              {rule.name} <span className="text-soc-textMuted text-xs">({rule.id})</span>
            </div>
            <div className="flex items-center gap-4 text-xs font-bold text-red-600 dark:text-red-400">
              <span>FP Rate: {rule.falsePositiveRate}%</span>
              <span>Alert Volume: {rule.alertVolume}</span>
              <span>Overrides: {rule.overrideCount}</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-soc-secondaryCard border border-soc-border space-y-2">
            <span className="text-[10px] text-soc-textMuted uppercase font-bold block">REASON FOR RETIREMENT REVIEW</span>
            <p className="text-soc-textSecondary font-sans text-xs leading-relaxed">
              {rule.reasonForReview || 'High false-positive rate causing excessive analyst noise and decision overrides.'}
            </p>
          </div>

          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 font-sans text-xs font-bold text-center">
            ⚠ "This action requires authorized human review."
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-soc-secondaryCard border-t border-soc-border flex items-center justify-between gap-3">
          <button
            onClick={handleKeep}
            className="px-4 py-2 rounded-lg bg-soc-card hover:bg-soc-cardHover border border-soc-border text-soc-textPrimary font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4 text-soc-cyan" />
            <span>[ KEEP RULE ]</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-2 rounded-lg bg-soc-card hover:bg-soc-cardHover text-soc-textMuted hover:text-soc-textPrimary font-bold text-xs cursor-pointer"
            >
              Cancel
            </button>

            <button
              onClick={handleRetire}
              className="px-4 py-2 rounded-lg bg-red-100 dark:bg-red-950 hover:bg-red-200 dark:hover:bg-red-900 border border-red-300 dark:border-red-800 text-red-800 dark:text-red-300 font-bold text-xs shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>[ RETIRE RULE ]</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
