import React from 'react';
import { IncidentStatus } from '../../types/soc';
import { ShieldCheck, Search, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';

interface Props {
  status: IncidentStatus | string;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<Props> = ({ status, size = 'md' }) => {
  const getConfig = () => {
    switch (status) {
      case 'OPEN':
        return {
          bg: 'bg-[#FEE2E2] text-[#B91C1C] border-[#FECACA] dark:bg-red-950/80 dark:text-red-300 dark:border-red-700/80',
          icon: <AlertCircle className="w-3 h-3 text-red-600 dark:text-red-400" />,
          label: 'OPEN',
        };
      case 'INVESTIGATING':
        return {
          bg: 'bg-[#DBEAFE] text-[#1D4ED8] border-[#BFDBFE] dark:bg-cyan-950/80 dark:text-cyan-300 dark:border-cyan-700/80 dark:shadow-glow-cyan animate-pulse',
          icon: <Search className="w-3 h-3 text-blue-600 dark:text-cyan-400" />,
          label: 'INVESTIGATING',
        };
      case 'CONTAINED':
        return {
          bg: 'bg-[#DCFCE7] text-[#15803D] border-[#BBF7D0] dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-700/80',
          icon: <ShieldCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />,
          label: 'CONTAINED',
        };
      case 'RESOLVED':
        return {
          bg: 'bg-[#DCFCE7] text-[#15803D] border-[#BBF7D0] dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-700/80',
          icon: <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />,
          label: 'RESOLVED',
        };
      case 'CLOSED':
        return {
          bg: 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-900/80 dark:text-slate-400 dark:border-slate-700',
          icon: <XCircle className="w-3 h-3 text-slate-500 dark:text-slate-400" />,
          label: 'CLOSED',
        };
      default:
        return {
          bg: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-900/80 dark:text-slate-300 dark:border-slate-700',
          icon: <AlertCircle className="w-3 h-3 text-slate-500 dark:text-slate-400" />,
          label: status,
        };
    }
  };

  const config = getConfig();
  const sizeStyle = size === 'sm' ? 'px-2 py-0.5 text-[10px] font-bold' : 'px-2.5 py-1 text-xs font-bold';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border font-mono tracking-wide ${config.bg} ${sizeStyle}`}>
      {config.icon}
      <span>{config.label}</span>
    </span>
  );
};
