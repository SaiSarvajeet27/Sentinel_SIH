import React from 'react';
import { GitCompare, UserCheck } from 'lucide-react';
import { AISafetyEvent } from '../../types/soc';

interface Props {
  event: AISafetyEvent;
}

export const ConflictingAlertCard: React.FC<Props> = ({ event }) => {
  return (
    <div className="p-5 rounded-xl border border-amber-300 dark:border-amber-800/80 bg-soc-card shadow-soc-card space-y-3 font-sans text-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-950 border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-400">
            <GitCompare className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-bold text-soc-textPrimary text-sm">{event.title}</h4>
            <p className="text-[10px] text-soc-textMuted">Sources: {event.source} • {event.timestamp}</p>
          </div>
        </div>
        <span className="px-2.5 py-1 rounded border bg-amber-100 dark:bg-amber-950 border-amber-300 dark:border-amber-600 text-amber-800 dark:text-amber-300 font-bold tracking-wider uppercase text-[10px]">
          {event.status}
        </span>
      </div>

      <div>
        <span className="text-[10px] text-soc-textMuted font-bold uppercase tracking-wider block mb-1">Conflicting Telemetry Signals:</span>
        <div className="p-3 rounded-lg bg-soc-secondaryCard border border-soc-border text-amber-800 dark:text-amber-300 break-all font-mono text-[11px]">
          {event.payload}
        </div>
      </div>

      <div className="p-3 rounded-lg bg-soc-secondaryCard border border-soc-border text-soc-textSecondary space-y-1 font-sans">
        <div className="font-mono text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase">Reasoning Engine Decision:</div>
        <p className="leading-relaxed">{event.reasoning}</p>
      </div>

      <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-bold text-xs pt-1">
        <UserCheck className="w-4 h-4" />
        <span>Governance Resolution: {event.mitigation}</span>
      </div>
    </div>
  );
};
