import React from 'react';
import { X, ShieldAlert, Cpu, User, Monitor, Clock, FileCode, CheckCircle, Info } from 'lucide-react';
import { AttackNodeData } from '../../types/soc';
import { SeverityBadge } from '../common/SeverityBadge';

interface Props {
  nodeData: AttackNodeData | null;
  onClose: () => void;
}

export const NodeDetailPanel: React.FC<Props> = ({ nodeData, onClose }) => {
  if (!nodeData) return null;

  return (
    <div className="w-96 bg-soc-card border-l border-soc-border h-full flex flex-col shadow-2xl overflow-y-auto animate-slide-left">
      {/* Header */}
      <div className="p-4 border-b border-soc-border bg-soc-secondaryCard flex items-start justify-between">
        <div>
          <span className="text-[10px] font-bold text-soc-textMuted uppercase tracking-widest font-mono">
            {nodeData.stage}
          </span>
          <h3 className="text-sm font-bold text-soc-textPrimary font-mono mt-0.5">{nodeData.label}</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-soc-textMuted hover:text-soc-textPrimary hover:bg-soc-cardHover transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="p-5 space-y-4 text-xs font-mono">
        {/* Severity & Event ID */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-soc-secondaryCard border border-soc-border">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-soc-accent" />
            <span className="text-soc-textSecondary font-bold">Event ID:</span>
            <span className="text-soc-cyan font-bold">{nodeData.eventId}</span>
          </div>
          <SeverityBadge severity={nodeData.severity} size="sm" />
        </div>

        {/* Affected Context */}
        <div className="space-y-2 p-3 rounded-lg bg-soc-secondaryCard border border-soc-border text-soc-textSecondary">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-soc-textMuted shrink-0" />
            <span className="text-soc-textMuted">Timestamp:</span>
            <span className="text-soc-textPrimary font-bold">{nodeData.timestamp}</span>
          </div>

          <div className="flex items-center gap-2">
            <User className="w-3.5 h-3.5 text-soc-textMuted shrink-0" />
            <span className="text-soc-textMuted">User:</span>
            <span className="text-soc-textPrimary font-bold">{nodeData.user}</span>
          </div>

          <div className="flex items-center gap-2">
            <Monitor className="w-3.5 h-3.5 text-soc-textMuted shrink-0" />
            <span className="text-soc-textMuted">Device:</span>
            <span className="text-soc-textPrimary font-bold">{nodeData.device}</span>
          </div>

          <div className="flex items-center gap-2">
            <Cpu className="w-3.5 h-3.5 text-soc-textMuted shrink-0" />
            <span className="text-soc-textMuted">Node Status:</span>
            <span className={`font-bold uppercase ${nodeData.status === 'contained' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
              {nodeData.status}
            </span>
          </div>
        </div>

        {/* What Happened */}
        <div>
          <h4 className="text-soc-textMuted font-bold uppercase tracking-wider text-[10px] mb-1">What Happened</h4>
          <p className="p-3 rounded-lg bg-soc-secondaryCard border border-soc-border text-soc-textSecondary leading-relaxed font-sans text-xs">
            {nodeData.description}
          </p>
        </div>

        {/* Why it Matters */}
        <div>
          <h4 className="text-amber-600 dark:text-amber-400 font-bold uppercase tracking-wider text-[10px] mb-1 flex items-center gap-1">
            <Info className="w-3.5 h-3.5" />
            <span>Why It Matters</span>
          </h4>
          <p className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-200 leading-relaxed font-sans text-xs">
            This step represents key progression in the attack lifecycle. Left unmitigated, it enables lateral movement and privilege escalation toward host compromise.
          </p>
        </div>

        {/* Forensic Details & Evidence */}
        <div>
          <h4 className="text-soc-textMuted font-bold uppercase tracking-wider text-[10px] mb-1 flex items-center gap-1">
            <FileCode className="w-3.5 h-3.5 text-soc-accent" />
            <span>Evidence Payload Log</span>
          </h4>
          <div className="p-3 rounded-lg soc-code-block text-[11px] leading-relaxed break-all">
            {nodeData.details}
          </div>
        </div>

        {/* SOC Action Recommendation */}
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300">
          <div className="flex items-center gap-1.5 font-bold mb-1">
            <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>AI Correlation Verified</span>
          </div>
          <p className="text-[11px] text-soc-textSecondary font-sans">
            Correlated with high confidence (94%) across Email, Identity, and Endpoint telemetry streams.
          </p>
        </div>
      </div>
    </div>
  );
};
