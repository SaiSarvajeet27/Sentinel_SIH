import React from 'react';
import { Mail, HardDrive, User, Network, Layers } from 'lucide-react';
import { useSOC } from '../common/SOCContext';
import { EventSource } from '../../types/soc';

interface Props {
  incidentId?: string;
  onSelectSourceFilter?: (source: EventSource | 'ALL') => void;
  activeSourceFilter?: string;
}

export const DataSourceAttributionCard: React.FC<Props> = ({
  incidentId,
  onSelectSourceFilter,
  activeSourceFilter = 'ALL',
}) => {
  const { getDataSourceSummary } = useSOC();
  const summary = getDataSourceSummary(incidentId);

  const sources: { key: EventSource; label: string; count: number; icon: React.FC<{ className?: string }>; color: string }[] = [
    { key: 'EMAIL', label: 'Email', count: summary.emailCount, icon: Mail, color: 'text-purple-800 dark:text-purple-300 border-purple-300 dark:border-purple-800 bg-purple-100 dark:bg-purple-950/40' },
    { key: 'ENDPOINT', label: 'Endpoint', count: summary.endpointCount, icon: HardDrive, color: 'text-cyan-800 dark:text-cyan-300 border-cyan-300 dark:border-cyan-800 bg-cyan-100 dark:bg-cyan-950/40' },
    { key: 'IDENTITY', label: 'Identity', count: summary.identityCount, icon: User, color: 'text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800 bg-amber-100 dark:bg-amber-950/40' },
    { key: 'NETWORK', label: 'Network', count: summary.networkCount, icon: Network, color: 'text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-800 bg-blue-100 dark:bg-blue-950/40' },
  ];

  return (
    <div className="p-4 rounded-xl bg-soc-card border border-soc-border space-y-3 font-mono text-xs shadow-soc-card">
      <div className="flex items-center justify-between border-b border-soc-border pb-2.5">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-soc-accent" />
          <h3 className="font-bold text-soc-textPrimary uppercase tracking-wider text-xs">Telemetry Source Attribution</h3>
        </div>
        <span className="text-soc-textMuted text-[10px]">
          Total Ingested Events: <strong className="text-soc-textPrimary font-bold">{summary.totalCount}</strong>
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {sources.map((src) => {
          const Icon = src.icon;
          const isSelected = activeSourceFilter === src.key;

          return (
            <div
              key={src.key}
              onClick={() => onSelectSourceFilter && onSelectSourceFilter(isSelected ? 'ALL' : src.key)}
              className={`p-2.5 rounded-lg border transition-all ${src.color} ${
                onSelectSourceFilter ? 'cursor-pointer hover:brightness-105 dark:hover:brightness-125' : ''
              } ${isSelected ? 'ring-2 ring-soc-cyan shadow-sm dark:shadow-glow-cyan' : ''}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-bold uppercase tracking-wider opacity-80">{src.label}</span>
                <Icon className="w-3.5 h-3.5" />
              </div>
              <div className="text-base font-extrabold text-soc-textPrimary">{src.count} <span className="text-[10px] text-soc-textMuted font-normal">events</span></div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
