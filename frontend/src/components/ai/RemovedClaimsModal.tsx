import React, { useState } from 'react';
import { X, Filter, ShieldAlert, AlertOctagon } from 'lucide-react';
import { useSOC } from '../common/SOCContext';

interface Props {
  incidentId?: string;
  size?: 'sm' | 'md';
}

export const RemovedClaimsModal: React.FC<Props> = ({ incidentId, size = 'md' }) => {
  const { getAITransparency } = useSOC();
  const transparency = getAITransparency(incidentId);
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        title="Click to view AI Transparency & Removed Unverifiable Claims"
        className={`inline-flex items-center gap-2 rounded-xl bg-purple-100 dark:bg-purple-950/60 hover:bg-purple-200 dark:hover:bg-purple-900/80 border border-purple-300 dark:border-purple-700 text-purple-800 dark:text-purple-300 font-sans font-bold transition-all shadow-sm cursor-pointer ${
          size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3.5 py-1.5 text-xs'
        }`}
      >
        <Filter className="w-3.5 h-3.5 text-soc-ai" />
        <span>AI Transparency: {transparency.verifiedCount}/{transparency.totalGenerated} Verified</span>
        <span className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950 border border-red-300 dark:border-red-800 text-red-800 dark:text-red-400 text-[10px] font-bold">
          ⚠ {transparency.removedCount} Removed
        </span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-soc-card border border-soc-border rounded-2xl max-w-xl w-full overflow-hidden shadow-2xl animate-fade-in font-sans">
            {/* Header */}
            <div className="p-5 bg-gradient-to-r from-soc-card via-soc-card to-soc-ai/10 border-b border-soc-border flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/60 border border-purple-300 dark:border-purple-700 text-purple-800 dark:text-purple-300">
                  <Filter className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-soc-textPrimary tracking-wide">
                    AI Transparency — Removed Unverifiable Claims
                  </h2>
                  <p className="text-xs text-soc-textMuted">Claims generated: {transparency.totalGenerated} | Verified: {transparency.verifiedCount} | Filtered Out: {transparency.removedCount}</p>
                </div>
              </div>

              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-soc-textMuted hover:text-soc-textPrimary hover:bg-soc-cardHover transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 text-xs">
              <div className="p-3.5 rounded-xl bg-soc-secondaryCard border border-soc-border text-soc-textSecondary font-sans text-xs flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 text-soc-ai shrink-0 mt-0.5" />
                <span>
                  The AI verification engine removes claims that lack sufficient corroborating telemetry prior to presenting final analysis to the analyst.
                </span>
              </div>

              <div className="space-y-3">
                <h3 className="text-xs font-bold text-soc-textPrimary uppercase tracking-wider">
                  Claims Removed from Final Explanation:
                </h3>

                {transparency.removedClaims.map((item) => (
                  <div key={item.id} className="p-4 rounded-xl bg-soc-secondaryCard border border-red-200 dark:border-red-900/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-red-600 dark:text-red-400 font-mono text-xs flex items-center gap-1.5">
                        <AlertOctagon className="w-3.5 h-3.5" />
                        Unverifiable Claim #{item.id}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-red-100 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 font-bold">
                        Filtered Out
                      </span>
                    </div>

                    <div className="p-2.5 rounded bg-soc-card border border-soc-border text-soc-textSecondary font-sans line-through opacity-85">
                      "{item.claimText}"
                    </div>

                    <div className="text-[11px] text-soc-textSecondary font-sans">
                      <strong className="text-amber-600 dark:text-amber-400 font-mono">Removal Rationale:</strong> {item.removalReason}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-soc-secondaryCard border-t border-soc-border flex items-center justify-end">
              <button
                onClick={() => setIsOpen(false)}
                className="px-5 py-2 rounded-lg bg-soc-card hover:bg-soc-cardHover border border-soc-border text-soc-textPrimary font-bold transition-colors cursor-pointer"
              >
                CLOSE PANEL
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
