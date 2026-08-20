import React from 'react';
import { X, Layers, AlertCircle, ArrowRight } from 'lucide-react';
import { ApprovalRequest, ActionAlternative } from '../../types/soc';
import { TierBadge } from '../common/TierBadge';

interface Props {
  isOpen: boolean;
  request: ApprovalRequest | null;
  alternatives: ActionAlternative[];
  onClose: () => void;
  onSelectOverride?: (alternativeTitle: string) => void;
}

export const AlternativesModal: React.FC<Props> = ({ isOpen, request, alternatives, onClose, onSelectOverride }) => {
  if (!isOpen || !request) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-soc-card border border-soc-border rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl animate-fade-in font-sans">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-soc-card via-soc-card to-soc-accent/10 border-b border-soc-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/60 border border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-300">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-soc-textPrimary tracking-wide">
                Alternative Response Actions Comparison
              </h2>
              <p className="text-xs text-soc-textMuted">Request: {request.id} | Incident: {request.incidentId}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-soc-textMuted hover:text-soc-textPrimary hover:bg-soc-cardHover transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 text-xs">
          {/* Currently Recommended Action */}
          <div className="p-3.5 rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/80 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-soc-ai uppercase tracking-widest block">AI Primary Recommendation</span>
              <h4 className="font-bold text-soc-textPrimary font-mono text-sm mt-0.5">{request.actionTitle}</h4>
            </div>
            <TierBadge tier={request.tier || 'TIER_2'} size="sm" />
          </div>

          <h3 className="text-xs font-bold text-soc-textPrimary uppercase tracking-wider pt-2">
            Available Mitigation Alternatives
          </h3>

          {alternatives.length === 0 && (
            <div className="p-4 rounded-xl bg-soc-secondaryCard border border-soc-border text-center text-soc-textMuted text-xs">
              No alternative mitigation actions available for this incident's matched playbook.
            </div>
          )}

          <div className="space-y-3">
            {alternatives.map((alt) => (
              <div
                key={alt.id}
                className="p-4 rounded-xl bg-soc-secondaryCard border border-soc-border hover:border-soc-borderLight transition-all space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-soc-textPrimary text-sm font-mono">{alt.title}</span>
                    <TierBadge tier={alt.tier} size="sm" />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-300">
                      Risk: {alt.riskLevel}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-emerald-100 dark:bg-emerald-950 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-400">
                      Reversible: {alt.reversibility}
                    </span>
                  </div>
                </div>

                <p className="text-soc-textSecondary font-sans text-xs">{alt.description}</p>

                <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <span><strong>Trade-off:</strong> {alt.tradeOff}</span>
                </div>

                {onSelectOverride && (
                  <div className="pt-1 flex justify-end">
                    <button
                      onClick={() => {
                        onClose();
                        onSelectOverride(alt.title);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-cyan-100 dark:bg-cyan-950 hover:bg-cyan-200 dark:hover:bg-cyan-900 border border-cyan-300 dark:border-cyan-700 text-cyan-800 dark:text-cyan-300 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <span>SELECT THIS ALTERNATIVE (OVERRIDE)</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-soc-secondaryCard border-t border-soc-border flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-soc-card hover:bg-soc-cardHover border border-soc-border text-soc-textPrimary font-bold transition-colors cursor-pointer"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
};
