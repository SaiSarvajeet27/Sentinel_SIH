import React, { useState } from 'react';
import { Award, HelpCircle, ArrowUpRight } from 'lucide-react';
import { useSOC } from '../common/SOCContext';
import { TrustScoreDetailModal } from './TrustScoreDetailModal';

export const TrustScoreCard: React.FC = () => {
  const { trustMetrics } = useSOC();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (trustMetrics.trustScore / 100) * circumference;

  return (
    <>
      <div
        onClick={() => setIsModalOpen(true)}
        className="p-4 rounded-xl bg-soc-card border border-soc-border hover:border-soc-ai/80 transition-all cursor-pointer group space-y-3 font-sans relative shadow-soc-card"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-soc-ai/15 text-soc-ai group-hover:scale-105 transition-transform">
              <Award className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-xs font-bold text-soc-textPrimary uppercase tracking-wider">
                  AI TRUST SCORE
                </h3>
                <div
                  className="relative"
                  onMouseEnter={() => setShowTooltip(true)}
                  onMouseLeave={() => setShowTooltip(false)}
                >
                  <HelpCircle className="w-3.5 h-3.5 text-soc-textMuted hover:text-soc-ai transition-colors" />
                  {showTooltip && (
                    <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-1.5 rounded-lg bg-soc-card border border-soc-ai text-soc-textPrimary text-[10px] whitespace-nowrap shadow-soc-elevated z-20 font-sans">
                      Percentage of AI recommendations accepted by analysts.
                    </div>
                  )}
                </div>
              </div>
              <span className="text-[10px] text-soc-textMuted">Analyst Acceptance Metric</span>
            </div>
          </div>

          <div className="flex items-center gap-1 text-xs text-soc-ai group-hover:opacity-80 transition-opacity font-semibold">
            <span>Details</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-soc-border">
          <div className="flex items-center gap-3">
            {/* SVG Circular Progress Ring */}
            <div className="relative w-16 h-16 flex items-center justify-center shrink-0">
              <svg className="w-16 h-16 -rotate-90">
                <circle
                  cx="32"
                  cy="32"
                  r={radius}
                  stroke="currentColor"
                  strokeWidth="5"
                  fill="transparent"
                  className="text-soc-border"
                />
                <circle
                  cx="32"
                  cy="32"
                  r={radius}
                  stroke="url(#trustGradient)"
                  strokeWidth="5"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  fill="transparent"
                  className="transition-all duration-1000 ease-out"
                />
                <defs>
                  <linearGradient id="trustGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#1683FF" />
                    <stop offset="100%" stopColor="#8B5CF6" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute text-center">
                <span className="text-xs font-bold text-soc-textPrimary">{trustMetrics.trustScore}%</span>
              </div>
            </div>

            <div>
              <div className="text-xs font-bold text-soc-textPrimary tracking-tight">
                High Reliability
              </div>
              <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                {trustMetrics.accepted}/{trustMetrics.total} Accepted
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1 text-[10px] font-mono">
            <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800/60 font-bold">
              Acc: {trustMetrics.accepted}
            </span>
            <span className="px-2 py-0.5 rounded bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-400 border border-red-300 dark:border-red-800/60 font-bold">
              Rej: {trustMetrics.rejected}
            </span>
            <span className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-400 border border-amber-300 dark:border-amber-800/60 font-bold">
              Ovr: {trustMetrics.overridden}
            </span>
          </div>
        </div>
      </div>

      <TrustScoreDetailModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
};
