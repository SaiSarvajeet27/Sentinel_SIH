import React from 'react';
import {
  Zap,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';

interface Props {
  executionResult: {
    success: boolean;
    executedAction: string;
    target: string;
    timestamp: string;
    verifiedStatus: string;
  } | null;
  isProcessing?: boolean;
}

export const LiveResponseExecutionPanel: React.FC<Props> = ({
  executionResult,
  isProcessing = false,
}) => {
  if (!executionResult) {
    return (
      <div className="bg-soc-card border border-soc-border rounded-xl p-5 shadow-sm space-y-3 flex flex-col items-center justify-center min-h-[190px] text-center">
        <div className="p-3 rounded-full bg-soc-secondaryCard text-soc-textMuted border border-soc-border">
          <Zap className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <div className="text-xs font-bold text-soc-textPrimary">Actuator Execution Standby</div>
          <p className="text-[11px] text-soc-textSecondary max-w-sm">
            Containment actions only execute following explicit human authorization (APPROVE or OVERRIDE).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-soc-card border border-soc-border rounded-xl p-4 shadow-sm space-y-3.5">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-soc-border pb-2.5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-500">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold text-soc-textPrimary">
                Simulated Response Execution
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Authorized & Executed
              </span>
            </div>
            <div className="text-[10px] text-soc-textSecondary font-medium mt-0.5">
              Governed Identity Actuator Connector
            </div>
          </div>
        </div>

        <span className="text-[10px] font-mono text-soc-textMuted">
          {new Date(executionResult.timestamp).toLocaleTimeString('en-US', { hour12: false })}
        </span>
      </div>

      {/* Execution Details Card */}
      <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-soc-textMuted text-[10px] font-semibold">Executed Containment Command:</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-mono text-[10px] font-bold">EXIT_CODE: 0 (SUCCESS)</span>
        </div>
        <div className="text-sm font-bold text-soc-textPrimary">
          "{executionResult.executedAction}"
        </div>
        <div className="text-[11px] text-soc-textSecondary flex items-center gap-1.5 pt-1 border-t border-emerald-500/20">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <span>{executionResult.verifiedStatus}</span>
        </div>
      </div>

      {/* Scope Confirmation Grid */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="p-2 rounded-lg bg-soc-secondaryCard border border-soc-border space-y-0.5">
          <span className="text-soc-textMuted text-[10px]">Target Account:</span>
          <div className="font-semibold text-soc-textPrimary truncate">{executionResult.target}</div>
        </div>
        <div className="p-2 rounded-lg bg-soc-secondaryCard border border-soc-border space-y-0.5">
          <span className="text-soc-textMuted text-[10px]">Threat Status:</span>
          <div className="font-semibold text-emerald-500 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Threat Contained
          </div>
        </div>
      </div>
    </div>
  );
};
