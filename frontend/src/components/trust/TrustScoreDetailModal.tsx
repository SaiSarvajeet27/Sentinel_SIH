import React from 'react';
import { X, TrendingUp, Award, CheckCircle2, XCircle, Sliders, ShieldCheck } from 'lucide-react';
import { useSOC } from '../common/SOCContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const TrustScoreDetailModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { trustMetrics, aiEnabled } = useSOC();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200 font-sans text-xs">
      <div className="w-full max-w-2xl bg-soc-card border border-purple-800/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 bg-gradient-to-r from-soc-card via-soc-card to-soc-ai/10 border-b border-soc-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-100 dark:bg-purple-900/60 border border-purple-300 dark:border-purple-700 text-purple-800 dark:text-purple-300 shadow-sm dark:shadow-glow-purple">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-soc-textPrimary tracking-wider uppercase">
                AI TRUST SCORE & ANALYST ACCEPTANCE BREAKDOWN
              </h2>
              <p className="text-soc-textMuted text-[11px] font-sans">
                Percentage of AI recommendations accepted by human analysts over operational periods
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
        <div className="p-6 space-y-6 overflow-y-auto font-mono">
          {/* Main Stat Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60 text-center">
            <div>
              <span className="text-[10px] text-soc-textMuted uppercase font-bold block">Overall Trust</span>
              <span className="text-2xl font-extrabold text-soc-ai">{trustMetrics.trustScore}%</span>
            </div>
            <div>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase font-bold block flex items-center justify-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Accepted
              </span>
              <span className="text-xl font-bold text-soc-textPrimary">{trustMetrics.accepted}</span>
            </div>
            <div>
              <span className="text-[10px] text-red-600 dark:text-red-400 uppercase font-bold block flex items-center justify-center gap-1">
                <XCircle className="w-3 h-3" /> Rejected
              </span>
              <span className="text-xl font-bold text-soc-textPrimary">{trustMetrics.rejected}</span>
            </div>
            <div>
              <span className="text-[10px] text-amber-600 dark:text-amber-400 uppercase font-bold block flex items-center justify-center gap-1">
                <Sliders className="w-3 h-3" /> Overridden
              </span>
              <span className="text-xl font-bold text-soc-textPrimary">{trustMetrics.overridden}</span>
            </div>
          </div>

          {!aiEnabled && (
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-center font-sans text-xs">
              <strong>Note:</strong> AI Assistance is currently DISABLED. Trust metrics reflect historical human decisions.
            </div>
          )}

          {/* Historical Trend Chart / Periods */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-soc-textPrimary uppercase tracking-wider flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-soc-cyan" />
              LAST 7 OPERATIONAL PERIODS TREND
            </h3>

            <div className="p-4 rounded-xl bg-soc-secondaryCard border border-soc-border space-y-2">
              <div className="flex items-end justify-between gap-2 h-32 pt-4 px-2">
                {trustMetrics.history.map((h, idx) => {
                  const isCurrent = idx === trustMetrics.history.length - 1;
                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                      <span className={`text-[10px] font-bold ${isCurrent ? 'text-soc-cyan' : 'text-soc-textMuted'}`}>
                        {h.score}%
                      </span>
                      <div
                        style={{ height: `${h.score}%` }}
                        className={`w-full max-w-[28px] rounded-t-md transition-all ${
                          isCurrent
                            ? 'bg-gradient-to-t from-cyan-600 to-purple-500 shadow-sm dark:shadow-glow-cyan'
                            : 'bg-purple-200 dark:bg-purple-900/60 hover:bg-purple-300 dark:hover:bg-purple-800'
                        }`}
                      />
                      <span className="text-[9px] text-soc-textMuted uppercase font-mono truncate max-w-[48px]">
                        {h.period.replace(' (Current)', '')}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Top Accepted Categories */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-soc-textPrimary uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              TOP ACCEPTED RECOMMENDATION TYPES
            </h3>

            <div className="space-y-2.5">
              {trustMetrics.topAcceptedTypes.map((cat, idx) => (
                <div key={idx} className="p-3 rounded-xl bg-soc-secondaryCard border border-soc-border space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-soc-textPrimary">{cat.category}</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">{cat.rate}% Acceptance</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-soc-card border border-soc-border overflow-hidden">
                    <div
                      style={{ width: `${cat.rate}%` }}
                      className="h-full bg-emerald-500 rounded-full"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-soc-secondaryCard border border-soc-border text-[11px] text-soc-textMuted font-sans leading-relaxed">
            <strong>Product Vision Principle:</strong> Trust Score represents analyst alignment over time. Human decisions create feedback that directly evaluates detection rule precision.
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-soc-secondaryCard border-t border-soc-border flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-soc-card hover:bg-soc-cardHover border border-soc-border text-soc-textPrimary font-bold text-xs transition-colors cursor-pointer"
          >
            Close Breakdown
          </button>
        </div>
      </div>
    </div>
  );
};
