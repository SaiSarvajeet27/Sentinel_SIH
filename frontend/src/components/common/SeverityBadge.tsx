import React from 'react';
import { Severity } from '../../types/soc';
import { AlertOctagon, AlertTriangle, AlertCircle, Info, ShieldAlert } from 'lucide-react';

interface Props {
  severity: Severity;
  showIcon?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const SeverityBadge: React.FC<Props> = ({ severity, showIcon = true, size = 'md' }) => {
  const getConfig = () => {
    switch (severity) {
      case 'CRITICAL':
        return {
          bg: 'bg-[#FEE2E2] text-[#B91C1C] border-[#FECACA] dark:bg-red-950/80 dark:border-red-700/80 dark:text-red-400 dark:shadow-glow-red animate-pulse-slow',
          icon: <AlertOctagon className="w-3 h-3 text-red-600 dark:text-red-400 shrink-0" />,
          label: 'CRITICAL',
        };
      case 'HIGH':
        return {
          bg: 'bg-[#FFEDD5] text-[#C2410C] border-[#FED7AA] dark:bg-orange-950/80 dark:border-orange-700/80 dark:text-orange-400',
          icon: <AlertTriangle className="w-3 h-3 text-orange-600 dark:text-orange-400 shrink-0" />,
          label: 'HIGH',
        };
      case 'MEDIUM':
        return {
          bg: 'bg-[#FEF3C7] text-[#B45309] border-[#FDE68A] dark:bg-amber-950/80 dark:border-amber-700/80 dark:text-amber-400',
          icon: <ShieldAlert className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />,
          label: 'MEDIUM',
        };
      case 'LOW':
        return {
          bg: 'bg-[#DBEAFE] text-[#1D4ED8] border-[#BFDBFE] dark:bg-blue-950/80 dark:border-blue-700/80 dark:text-blue-400',
          icon: <AlertCircle className="w-3 h-3 text-blue-600 dark:text-blue-400 shrink-0" />,
          label: 'LOW',
        };
      case 'INFO':
      default:
        return {
          bg: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-900/80 dark:border-slate-700 dark:text-slate-300',
          icon: <Info className="w-3 h-3 text-slate-500 dark:text-slate-400 shrink-0" />,
          label: 'INFO',
        };
    }
  };

  const config = getConfig();

  const sizeClasses = {
    sm: 'text-[10px] px-2 py-0.5 space-x-1 font-bold',
    md: 'text-xs px-2.5 py-1 space-x-1.5 font-bold',
    lg: 'text-sm px-3 py-1.5 space-x-2 font-extrabold',
  };

  return (
    <span
      className={`inline-flex items-center rounded-md border tracking-wider uppercase font-mono ${config.bg} ${sizeClasses[size]}`}
    >
      {showIcon && config.icon}
      <span>{config.label}</span>
    </span>
  );
};
