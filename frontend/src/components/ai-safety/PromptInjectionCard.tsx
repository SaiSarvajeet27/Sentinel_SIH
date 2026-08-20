import React from 'react';
import { ShieldCheck, AlertOctagon } from 'lucide-react';
import { AISafetyEvent } from '../../types/soc';

interface Props {
  event: AISafetyEvent;
}

export const PromptInjectionCard: React.FC<Props> = ({ event }) => {
  return (
    <div className="p-5 rounded-xl border border-purple-300 dark:border-purple-800/80 bg-soc-card shadow-soc-card space-y-3 font-sans text-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-950 border border-purple-300 dark:border-purple-800 text-purple-800 dark:text-purple-400">
            <AlertOctagon className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <h4 className="font-bold text-soc-textPrimary text-sm">{event.title}</h4>
            <p className="text-[10px] text-soc-textMuted">Source: {event.source} • {event.timestamp}</p>
          </div>
        </div>
        <span className="px-2.5 py-1 rounded border bg-purple-100 dark:bg-purple-950 border-purple-300 dark:border-purple-600 text-purple-800 dark:text-purple-300 font-bold tracking-wider uppercase text-[10px]">
          {event.status}
        </span>
      </div>

      <div>
        <span className="text-[10px] text-soc-textMuted font-bold uppercase tracking-wider block mb-1">Untrusted Adversarial Payload:</span>
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-800 dark:text-red-300 break-all font-mono text-[11px]">
          {event.payload}
        </div>
      </div>

      <div className="p-3 rounded-lg bg-soc-secondaryCard border border-soc-border text-soc-textSecondary space-y-1 font-sans">
        <div className="font-mono text-[11px] font-bold text-soc-ai uppercase">AI Safety Defense System Analysis:</div>
        <p className="leading-relaxed">{event.reasoning}</p>
      </div>

      <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-bold text-xs pt-1">
        <ShieldCheck className="w-4 h-4" />
        <span>Mitigation Action: {event.mitigation}</span>
      </div>
    </div>
  );
};
