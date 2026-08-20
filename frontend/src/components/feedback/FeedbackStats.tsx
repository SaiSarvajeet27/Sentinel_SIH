import React from 'react';
import { ThumbsUp, AlertTriangle, Edit3, Target } from 'lucide-react';

interface Props {
  stats: {
    totalSubmitted: number;
    confirmedCount: number;
    falsePositivesCount: number;
    modifiedCount: number;
    accuracyPercentage: number;
  };
}

export const FeedbackStats: React.FC<Props> = ({ stats }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-sans">
      <div className="p-4 rounded-xl bg-soc-card border border-soc-border flex items-center justify-between shadow-soc-card">
        <div>
          <span className="text-[10px] text-soc-textMuted font-bold uppercase tracking-wider">AI Accuracy Rate</span>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{stats.accuracyPercentage}%</div>
        </div>
        <div className="p-2.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-400">
          <Target className="w-5 h-5" />
        </div>
      </div>

      <div className="p-4 rounded-xl bg-soc-card border border-soc-border flex items-center justify-between shadow-soc-card">
        <div>
          <span className="text-[10px] text-soc-textMuted font-bold uppercase tracking-wider">Confirmed Threats</span>
          <div className="text-2xl font-black text-soc-cyan mt-1">{stats.confirmedCount}</div>
        </div>
        <div className="p-2.5 rounded-lg bg-cyan-100 dark:bg-cyan-950/60 border border-cyan-300 dark:border-cyan-800 text-cyan-800 dark:text-cyan-400">
          <ThumbsUp className="w-5 h-5" />
        </div>
      </div>

      <div className="p-4 rounded-xl bg-soc-card border border-soc-border flex items-center justify-between shadow-soc-card">
        <div>
          <span className="text-[10px] text-soc-textMuted font-bold uppercase tracking-wider">False Positives</span>
          <div className="text-2xl font-black text-red-600 dark:text-red-400 mt-1">{stats.falsePositivesCount}</div>
        </div>
        <div className="p-2.5 rounded-lg bg-red-100 dark:bg-red-950/60 border border-red-300 dark:border-red-800 text-red-800 dark:text-red-400">
          <AlertTriangle className="w-5 h-5" />
        </div>
      </div>

      <div className="p-4 rounded-xl bg-soc-card border border-soc-border flex items-center justify-between shadow-soc-card">
        <div>
          <span className="text-[10px] text-soc-textMuted font-bold uppercase tracking-wider">Modified Decisions</span>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">{stats.modifiedCount}</div>
        </div>
        <div className="p-2.5 rounded-lg bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-400">
          <Edit3 className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
};
