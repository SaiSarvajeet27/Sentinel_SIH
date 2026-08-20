import React from 'react';
import { Cpu, Power } from 'lucide-react';
import { useSOC } from './SOCContext';

interface Props {
  size?: 'sm' | 'md';
  interactive?: boolean;
}

export const AIStatusBadge: React.FC<Props> = ({ size = 'md', interactive = true }) => {
  const { aiEnabled, toggleAI } = useSOC();

  const badgeContent = (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border font-mono font-bold transition-all select-none ${
        aiEnabled
          ? 'bg-[#DCFCE7] text-[#15803D] border-[#BBF7D0] dark:bg-emerald-950/80 dark:border-emerald-700/80 dark:text-emerald-400 dark:shadow-glow-cyan'
          : 'bg-[#FEE2E2] text-[#B91C1C] border-[#FECACA] dark:bg-red-950/80 dark:border-red-800/80 dark:text-red-400'
      } ${size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs'}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${aiEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
      <Cpu className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      <span>{aiEnabled ? 'AI ENABLED' : 'AI DISABLED'}</span>
      {interactive && <Power className="w-3 h-3 ml-0.5 opacity-75 group-hover:opacity-100" />}
    </span>
  );

  if (!interactive) return badgeContent;

  return (
    <button
      onClick={toggleAI}
      title={aiEnabled ? 'Click to disable AI assistance' : 'Click to enable AI assistance'}
      className="group focus:outline-none"
    >
      {badgeContent}
    </button>
  );
};
