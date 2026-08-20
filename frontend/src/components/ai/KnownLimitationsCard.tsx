import React from 'react';
import { EyeOff, AlertCircle } from 'lucide-react';
import { useSOC } from '../common/SOCContext';

interface Props {
  incidentId?: string;
}

export const KnownLimitationsCard: React.FC<Props> = ({ incidentId }) => {
  const { getKnownLimitations } = useSOC();
  const limitations = getKnownLimitations(incidentId);

  return (
    <div className="p-4 rounded-xl bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60 space-y-3 font-mono text-xs shadow-soc-card">
      <div className="flex items-center justify-between border-b border-amber-200 dark:border-amber-900/60 pb-2">
        <div className="flex items-center gap-2 font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider text-xs">
          <EyeOff className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          <span>Known Visibility Limitations & "Not Seen" Gaps</span>
        </div>
        <span className="text-[9px] px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950 border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 font-bold">
          Coverage Audit Warning
        </span>
      </div>

      <div className="space-y-2">
        {limitations.map((item) => (
          <div key={item.id} className="p-3 rounded-lg bg-soc-card border border-soc-border space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-amber-800 dark:text-amber-300 text-xs font-mono flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                {item.title}
              </span>
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-gray-400 font-bold">
                {item.category}
              </span>
            </div>

            <p className="text-soc-textSecondary font-sans text-xs leading-relaxed pl-5">{item.description}</p>
            <div className="text-[10px] text-soc-textMuted pl-5 font-mono">
              <strong className="text-amber-700 dark:text-amber-400 font-bold uppercase">System Impact:</strong> {item.impact}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
