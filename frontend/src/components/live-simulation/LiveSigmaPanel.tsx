import React, { useState } from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  Tag,
  Code2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { LiveSigmaDetection } from '../../types/liveSimulation';

interface Props {
  detection: LiveSigmaDetection | null;
  isProcessing?: boolean;
}

export const LiveSigmaPanel: React.FC<Props> = ({ detection, isProcessing = false }) => {
  const [showLogic, setShowLogic] = useState(false);

  if (!detection) {
    return (
      <div className="bg-soc-card border border-soc-border rounded-xl p-5 shadow-sm space-y-3 flex flex-col items-center justify-center min-h-[200px] text-center">
        <div className="p-3 rounded-full bg-soc-secondaryCard text-soc-textMuted border border-soc-border">
          <ShieldAlert className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <div className="text-xs font-bold text-soc-textPrimary">Sigma Rule Engine Idle</div>
          <p className="text-[11px] text-soc-textSecondary max-w-sm">
            Deterministic Sigma rule analysis activates after raw telemetry ingestion & correlation.
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
          <div className="p-1.5 rounded-lg bg-orange-500/15 text-orange-500">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-extrabold text-soc-textPrimary">
                {detection.ruleId}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                {detection.matchStatus}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-soc-secondaryCard border border-soc-border text-soc-textMuted">
                Simulated Rule Match
              </span>
            </div>
            <h3 className="text-xs font-bold text-soc-textPrimary mt-0.5">
              {detection.ruleTitle}
            </h3>
          </div>
        </div>

        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30">
          {detection.severity}
        </span>
      </div>

      {/* MITRE ATT&CK Mapping & Category */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        <div className="p-2.5 rounded-lg bg-soc-secondaryCard border border-soc-border space-y-1">
          <div className="flex items-center gap-1.5 text-soc-textMuted text-[10px] font-semibold">
            <Tag className="w-3 h-3 text-soc-accent" />
            <span>Category & Tactic</span>
          </div>
          <div className="font-semibold text-soc-textPrimary">{detection.category}</div>
          <div className="text-[11px] text-soc-textSecondary font-mono">{detection.mitreTactic}</div>
        </div>

        <div className="p-2.5 rounded-lg bg-soc-secondaryCard border border-soc-border space-y-1">
          <div className="flex items-center gap-1.5 text-soc-textMuted text-[10px] font-semibold">
            <ExternalLink className="w-3 h-3 text-soc-accent" />
            <span>MITRE ATT&CK ID</span>
          </div>
          <div className="font-mono font-bold text-soc-accent">{detection.mitreId}</div>
          <div className="text-[11px] text-soc-textSecondary">{detection.mitreTechnique}</div>
        </div>
      </div>

      {/* Detection Mechanism Note */}
      <div className="p-2.5 rounded-lg bg-soc-secondaryCard/70 border border-soc-border text-[11px] text-soc-textSecondary flex items-start gap-2">
        <span className="font-bold text-soc-textPrimary shrink-0">Trigger Logic:</span>
        <span>
          Cross-signal correlation triggered on email link execution event followed within 4 minutes by anomalous token exchange.
        </span>
      </div>

      {/* Sigma Rule Definition Accordion */}
      <div>
        <button
          onClick={() => setShowLogic(!showLogic)}
          className="flex items-center justify-between w-full p-2 rounded-lg bg-soc-secondaryCard border border-soc-border hover:bg-soc-cardHover transition-colors text-xs font-semibold text-soc-textSecondary"
        >
          <div className="flex items-center gap-1.5">
            <Code2 className="w-3.5 h-3.5 text-soc-textMuted" />
            <span>View Sigma YAML Rule Specification (Simulated)</span>
          </div>
          {showLogic ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>

        {showLogic && (
          <div className="mt-2 p-2.5 rounded-lg bg-slate-950 text-slate-200 border border-slate-800 text-[10px] font-mono overflow-x-auto">
            <pre>{detection.detectionLogic}</pre>
          </div>
        )}
      </div>
    </div>
  );
};
