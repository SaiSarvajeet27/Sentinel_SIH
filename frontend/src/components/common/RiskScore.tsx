import React from 'react';

interface Props {
  score: number;
  size?: 'sm' | 'md' | 'lg';
}

export const RiskScore: React.FC<Props> = ({ score, size = 'md' }) => {
  const getScoreColor = (val: number) => {
    if (val >= 85) return 'bg-[#FEE2E2] text-[#B91C1C] border-[#FECACA] dark:text-red-400 dark:bg-red-950/80 dark:border-red-700/80 dark:shadow-glow-red';
    if (val >= 70) return 'bg-[#FFEDD5] text-[#C2410C] border-[#FED7AA] dark:text-orange-400 dark:bg-orange-950/80 dark:border-orange-700/80';
    if (val >= 50) return 'bg-[#FEF3C7] text-[#B45309] border-[#FDE68A] dark:text-amber-400 dark:bg-amber-950/80 dark:border-amber-700/80';
    return 'bg-[#DBEAFE] text-[#1D4ED8] border-[#BFDBFE] dark:text-blue-400 dark:bg-blue-950/80 dark:border-blue-700/80';
  };

  const sizeClasses = {
    sm: 'text-[10px] px-1.5 py-0.5 font-bold',
    md: 'text-xs px-2.5 py-1 font-bold',
    lg: 'text-base px-3 py-1.5 font-extrabold',
  };

  return (
    <div className="inline-flex items-center gap-1.5 font-mono">
      <span className="text-[10px] text-soc-textSecondary font-mono uppercase tracking-wider">Risk:</span>
      <span className={`inline-block rounded border ${getScoreColor(score)} ${sizeClasses[size]}`}>
        {score}%
      </span>
    </div>
  );
};
