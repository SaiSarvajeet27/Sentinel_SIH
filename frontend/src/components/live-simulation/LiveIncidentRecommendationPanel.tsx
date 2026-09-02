import React from 'react';
import {
  FolderPlus,
  PlaySquare,
  Lock,
} from 'lucide-react';
import { LiveIncidentData, LiveResponseRecommendation } from '../../types/liveSimulation';
import clsx from 'clsx';

interface Props {
  incident: LiveIncidentData | null;
  recommendation: LiveResponseRecommendation | null;
  isProcessing?: boolean;
}

export const LiveIncidentRecommendationPanel: React.FC<Props> = ({
  incident,
  recommendation,
  isProcessing = false,
}) => {
  if (!incident && !recommendation) {
    return (
      <div className="bg-soc-card border border-soc-border rounded-xl p-5 shadow-sm space-y-3 flex flex-col items-center justify-center min-h-[220px] text-center">
        <div className="p-3 rounded-full bg-soc-secondaryCard text-soc-textMuted border border-soc-border">
          <FolderPlus className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <div className="text-xs font-bold text-soc-textPrimary">Incident & Playbook Formulation Idle</div>
          <p className="text-[11px] text-soc-textSecondary max-w-sm">
            Incidents and recommended playbooks are synthesized once AI threat evaluation completes.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-soc-card border border-soc-border rounded-xl p-4 shadow-sm space-y-3.5">
      {/* 1. Incident Card (Stage 5) */}
      {incident && (
        <div className="p-3 rounded-lg bg-soc-secondaryCard border border-soc-border space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-red-500/15 text-red-500">
                <FolderPlus className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-extrabold text-soc-textPrimary">
                    {incident.id}
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/15 text-red-500 border border-red-500/30">
                    {incident.severity}
                  </span>
                  <span
                    className={clsx(
                      'px-1.5 py-0.5 rounded text-[10px] font-bold border',
                      incident.status === 'CONTAINED'
                        ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
                        : incident.status === 'REJECTED'
                        ? 'bg-red-500/15 text-red-500 border-red-500/30'
                        : 'bg-orange-500/15 text-orange-500 border-orange-500/30'
                    )}
                  >
                    STATUS: {incident.status}
                  </span>
                </div>
                <h4 className="text-xs font-bold text-soc-textPrimary mt-0.5">{incident.title}</h4>
              </div>
            </div>

            {/* Risk Score Pill */}
            <div className="text-right">
              <div className="text-[10px] text-soc-textMuted uppercase font-semibold">Risk Score</div>
              <div className="text-sm font-black text-red-500 font-mono">{incident.riskScore} / 100</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] pt-2 border-t border-soc-border/60">
            <div>
              <span className="text-soc-textMuted">Target User: </span>
              <span className="font-semibold text-soc-textPrimary">{incident.affectedUser}</span>
            </div>
            <div>
              <span className="text-soc-textMuted">Host: </span>
              <span className="font-semibold text-soc-textPrimary">{incident.affectedHost}</span>
            </div>
          </div>
        </div>
      )}

      {/* 2. Response Recommendation & Governance (Stage 6) */}
      {recommendation && (
        <div className="p-3 rounded-lg bg-soc-secondaryCard border border-soc-border space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-purple-500/15 text-purple-500">
                <PlaySquare className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-soc-textMuted">
                  Recommended Response Playbook
                </span>
                <div className="text-xs font-bold text-soc-textPrimary">
                  {recommendation.playbookName}
                </div>
              </div>
            </div>

            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
              {recommendation.governanceTier}
            </span>
          </div>

          {/* Action Details */}
          <div className="p-2.5 rounded-lg bg-soc-card border border-soc-border space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-soc-textMuted text-[10px] font-semibold">Proposed Action:</span>
              <span className="text-emerald-500 font-bold text-[10px]">Reversible: {recommendation.reversibility}</span>
            </div>
            <div className="text-sm font-bold text-soc-textPrimary">
              "{recommendation.actionTitle}"
            </div>
            <p className="text-[11px] text-soc-textSecondary leading-snug">
              {recommendation.justification}
            </p>
          </div>

          {/* CRUCIAL GOVERNANCE DIFFERENTIATOR BANNER */}
          <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-2 text-xs">
            <Lock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="text-[11px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-300">
                AI RECOMMENDATION ≠ EXECUTION
              </div>
              <p className="text-[11px] text-soc-textSecondary leading-tight">
                Policy prohibits the language model from executing Tier 2/3 containment directly. Execution is strictly held for named human authorization in Stage 7.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
