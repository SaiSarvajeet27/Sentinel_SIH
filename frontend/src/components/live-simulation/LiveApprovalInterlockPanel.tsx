import React, { useState } from 'react';
import {
  Lock,
  CheckCircle2,
  XCircle,
  CornerUpRight,
  ArrowUpRight,
  UserCheck,
} from 'lucide-react';
import {
  LiveApprovalDecision,
  LiveResponseRecommendation,
  LiveIncidentData,
  LiveAIEvaluation,
} from '../../types/liveSimulation';
import clsx from 'clsx';

interface Props {
  isWaitingForApproval: boolean;
  recommendation: LiveResponseRecommendation | null;
  incident: LiveIncidentData | null;
  aiEvaluation: LiveAIEvaluation | null;
  approvalDecision: LiveApprovalDecision | null;
  activeAnalystName?: string;
  onApprove: (analystName?: string) => void;
  onReject: (reason: string, analystName?: string) => void;
  onOverride: (selectedAction: string, reason: string, analystName?: string) => void;
  onEscalate: (escalateTo: string, reason: string, analystName?: string) => void;
}

export const LiveApprovalInterlockPanel: React.FC<Props> = ({
  isWaitingForApproval,
  recommendation,
  incident,
  aiEvaluation,
  approvalDecision,
  activeAnalystName = 'admin@sentinel.local (SOC Manager)',
  onApprove,
  onReject,
  onOverride,
  onEscalate,
}) => {
  const [modalMode, setModalMode] = useState<'NONE' | 'REJECT' | 'OVERRIDE' | 'ESCALATE'>('NONE');
  const [rejectReason, setRejectReason] = useState('False positive / authorized penetration testing exercise');
  const [overrideAction, setOverrideAction] = useState('Trigger MFA Step-Up Challenge Only');
  const [overrideReason, setOverrideReason] = useState('Operator preference for lower disruption during business hours');
  const [escalateTo, setEscalateTo] = useState('Tier 3 / Senior Incident Commander');
  const [escalateReason, setEscalateReason] = useState('High blast radius spanning executive identity credentials');

  // If already decided:
  if (approvalDecision) {
    const isApproved = approvalDecision.decision === 'APPROVE';
    const isRejected = approvalDecision.decision === 'REJECT';
    const isOverridden = approvalDecision.decision === 'OVERRIDE';
    const isEscalated = approvalDecision.decision === 'ESCALATE';

    return (
      <div className="bg-soc-card border border-soc-border rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-soc-border pb-2.5">
          <div className="flex items-center gap-2">
            <div
              className={clsx(
                'p-1.5 rounded-lg',
                isApproved && 'bg-emerald-500/15 text-emerald-500',
                isRejected && 'bg-red-500/15 text-red-500',
                isOverridden && 'bg-purple-500/15 text-purple-500',
                isEscalated && 'bg-indigo-500/15 text-indigo-500'
              )}
            >
              <UserCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-soc-textPrimary flex items-center gap-2">
                <span>Human Governance Decision Recorded</span>
                <span
                  className={clsx(
                    'px-2 py-0.5 rounded text-[10px] font-black tracking-wider uppercase',
                    isApproved && 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30',
                    isRejected && 'bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30',
                    isOverridden && 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30',
                    isEscalated && 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30'
                  )}
                >
                  {approvalDecision.decision}
                </span>
              </div>
              <p className="text-[10px] text-soc-textMuted mt-0.5 font-mono">
                Decided by {approvalDecision.actor} at {new Date(approvalDecision.timestamp).toLocaleTimeString('en-US', { hour12: false })}
              </p>
            </div>
          </div>
          <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            Audit Linked ✓
          </span>
        </div>

        <div className="p-3 rounded-lg bg-soc-secondaryCard border border-soc-border space-y-1.5 text-xs">
          {approvalDecision.selectedActionTitle && (
            <div>
              <span className="text-soc-textMuted font-medium">Selected Action: </span>
              <strong className="text-soc-textPrimary">"{approvalDecision.selectedActionTitle}"</strong>
            </div>
          )}
          {approvalDecision.reason && (
            <div>
              <span className="text-soc-textMuted font-medium">Analyst Rationale: </span>
              <span className="text-soc-textSecondary">"{approvalDecision.reason}"</span>
            </div>
          )}
          {approvalDecision.escalateToRole && (
            <div>
              <span className="text-soc-textMuted font-medium">Escalated To: </span>
              <strong className="text-indigo-600 dark:text-indigo-400">{approvalDecision.escalateToRole}</strong>
            </div>
          )}
        </div>
      </div>
    );
  }

  // If not waiting for approval yet:
  if (!isWaitingForApproval) {
    return (
      <div className="bg-soc-card border border-soc-border rounded-xl p-5 shadow-sm space-y-3 flex flex-col items-center justify-center min-h-[220px] text-center">
        <div className="p-3 rounded-full bg-soc-secondaryCard text-soc-textMuted border border-soc-border">
          <Lock className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <div className="text-xs font-bold text-soc-textPrimary">Human Governance Interlock Standby</div>
          <p className="text-[11px] text-soc-textSecondary max-w-sm">
            When the simulation reaches Stage 7, it will automatically pause and hold for mandatory named analyst authorization.
          </p>
        </div>
      </div>
    );
  }

  // ACTIVE INTERLOCK - WAITING FOR HUMAN APPROVAL
  return (
    <div className="bg-soc-card border-2 border-amber-500/60 rounded-xl p-4 shadow-md space-y-4 relative overflow-hidden">
      {/* Top Pulsing Banner */}
      <div className="flex items-center justify-between bg-amber-500/15 -mx-4 -mt-4 px-4 py-2.5 border-b border-amber-500/30">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-amber-500 text-slate-950 animate-bounce">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-black tracking-wide text-amber-800 dark:text-amber-300 uppercase">
              HUMAN AUTHORIZATION REQUIRED — SAFETY INTERLOCK ENGAGED
            </div>
            <div className="text-[10px] text-amber-700 dark:text-amber-400 font-medium">
              Simulation paused. Autonomous execution blocked by policy until analyst acts.
            </div>
          </div>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/40">
          Tier 2 Governance
        </span>
      </div>

      {/* Target & Action Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
        <div className="p-2.5 rounded-lg bg-soc-secondaryCard border border-soc-border space-y-0.5">
          <div className="text-soc-textMuted text-[10px] font-semibold">Incident Reference</div>
          <div className="font-bold text-soc-textPrimary">{incident?.id || 'INC-LIVE-001'}</div>
          <div className="text-[10px] text-soc-textSecondary">{incident?.title}</div>
        </div>

        <div className="p-2.5 rounded-lg bg-soc-secondaryCard border border-soc-border space-y-0.5">
          <div className="text-soc-textMuted text-[10px] font-semibold">Proposed Containment Action</div>
          <div className="font-bold text-amber-600 dark:text-amber-400">
            "{recommendation?.actionTitle || 'Revoke active sessions'}"
          </div>
          <div className="text-[10px] text-soc-textSecondary">Target: analyst.smith@sentinel.local</div>
        </div>

        <div className="p-2.5 rounded-lg bg-soc-secondaryCard border border-soc-border space-y-0.5">
          <div className="text-soc-textMuted text-[10px] font-semibold">AI Confidence & Risk</div>
          <div className="font-bold text-soc-textPrimary">92% Confidence · Risk 88/100</div>
          <div className="text-[10px] text-emerald-500 font-semibold">Reversible: YES</div>
        </div>
      </div>

      {/* Justification & Governance details */}
      <div className="p-3 rounded-lg bg-soc-secondaryCard/80 border border-soc-border text-xs text-soc-textSecondary space-y-1">
        <div className="font-semibold text-soc-textPrimary">
          Why this action is held for authorization:
        </div>
        <p className="text-[11px] leading-relaxed">
          Revoking session tokens prevents adversary lateral movement across corporate SSO. While completely reversible with low blast radius, governance policy mandates human verification to ensure zero false-positive disruption for privileged employees.
        </p>
      </div>

      {/* ACTION BUTTONS */}
      <div className="space-y-2 pt-1 border-t border-soc-border">
        <div className="text-[11px] font-bold text-soc-textPrimary flex items-center justify-between">
          <span>Select Human Governance Action:</span>
          <span className="text-[10px] text-soc-textMuted font-normal">
            Acting as: <strong className="text-soc-textSecondary">{activeAnalystName}</strong>
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {/* 1. APPROVE */}
          <button
            onClick={() => onApprove(activeAnalystName)}
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-all hover:scale-[1.02] cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>APPROVE</span>
          </button>

          {/* 2. REJECT */}
          <button
            onClick={() => setModalMode('REJECT')}
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-red-600/15 hover:bg-red-600/25 border border-red-500/40 text-red-600 dark:text-red-400 font-bold text-xs transition-colors cursor-pointer"
          >
            <XCircle className="w-4 h-4" />
            <span>REJECT</span>
          </button>

          {/* 3. OVERRIDE */}
          <button
            onClick={() => setModalMode('OVERRIDE')}
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-purple-600/15 hover:bg-purple-600/25 border border-purple-500/40 text-purple-600 dark:text-purple-400 font-bold text-xs transition-colors cursor-pointer"
          >
            <CornerUpRight className="w-4 h-4" />
            <span>OVERRIDE</span>
          </button>

          {/* 4. ESCALATE */}
          <button
            onClick={() => setModalMode('ESCALATE')}
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-indigo-600/15 hover:bg-indigo-600/25 border border-indigo-500/40 text-indigo-600 dark:text-indigo-400 font-bold text-xs transition-colors cursor-pointer"
          >
            <ArrowUpRight className="w-4 h-4" />
            <span>ESCALATE</span>
          </button>
        </div>
      </div>

      {/* REJECT MODAL DIALOG */}
      {modalMode === 'REJECT' && (
        <div className="p-3 rounded-lg bg-soc-secondaryCard border border-red-500/40 space-y-2.5 mt-2 animate-fadeIn">
          <div className="flex items-center justify-between text-xs font-bold text-red-600 dark:text-red-400">
            <span className="flex items-center gap-1.5">
              <XCircle className="w-4 h-4" />
              Reject Response Action
            </span>
            <button onClick={() => setModalMode('NONE')} className="text-soc-textMuted hover:text-soc-textPrimary text-xs font-semibold">✕</button>
          </div>
          <p className="text-[11px] text-soc-textSecondary">
            Rejecting this recommendation aborts response execution and seals the incident with a rejection audit entry.
          </p>
          <div>
            <label className="text-[10px] font-semibold text-soc-textMuted block mb-1">Rejection Rationale:</label>
            <input
              type="text"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded bg-soc-card border border-soc-border text-xs text-soc-textPrimary focus:outline-none focus:border-red-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setModalMode('NONE')}
              className="px-3 py-1 rounded bg-soc-card border border-soc-border text-xs font-semibold text-soc-textSecondary"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onReject(rejectReason, activeAnalystName);
                setModalMode('NONE');
              }}
              className="px-3 py-1 rounded bg-red-600 text-white text-xs font-bold"
            >
              Confirm Rejection
            </button>
          </div>
        </div>
      )}

      {/* OVERRIDE MODAL DIALOG */}
      {modalMode === 'OVERRIDE' && (
        <div className="p-3 rounded-lg bg-soc-secondaryCard border border-purple-500/40 space-y-2.5 mt-2 animate-fadeIn">
          <div className="flex items-center justify-between text-xs font-bold text-purple-600 dark:text-purple-400">
            <span className="flex items-center gap-1.5">
              <CornerUpRight className="w-4 h-4" />
              Human Override — Select Alternative Action
            </span>
            <button onClick={() => setModalMode('NONE')} className="text-soc-textMuted hover:text-soc-textPrimary text-xs font-semibold">✕</button>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-soc-textMuted block">Choose Alternative Containment Scope:</label>
            <div className="space-y-1.5">
              {recommendation?.alternatives.map((alt) => (
                <div
                  key={alt.id}
                  onClick={() => setOverrideAction(alt.title)}
                  className={clsx(
                    'p-2 rounded border cursor-pointer transition-colors text-xs space-y-0.5',
                    overrideAction === alt.title
                      ? 'bg-purple-500/15 border-purple-500 text-soc-textPrimary font-semibold'
                      : 'bg-soc-card border-soc-border text-soc-textSecondary hover:border-soc-borderLight'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span>{alt.title}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-soc-secondaryCard border border-soc-border">{alt.tier}</span>
                  </div>
                  <p className="text-[10px] text-soc-textMuted">{alt.description}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-soc-textMuted block mb-1">Override Rationale:</label>
            <input
              type="text"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded bg-soc-card border border-soc-border text-xs text-soc-textPrimary focus:outline-none focus:border-purple-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setModalMode('NONE')}
              className="px-3 py-1 rounded bg-soc-card border border-soc-border text-xs font-semibold text-soc-textSecondary"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onOverride(overrideAction, overrideReason, activeAnalystName);
                setModalMode('NONE');
              }}
              className="px-3 py-1 rounded bg-purple-600 text-white text-xs font-bold"
            >
              Confirm Override & Execute
            </button>
          </div>
        </div>
      )}

      {/* ESCALATE MODAL DIALOG */}
      {modalMode === 'ESCALATE' && (
        <div className="p-3 rounded-lg bg-soc-secondaryCard border border-indigo-500/40 space-y-2.5 mt-2 animate-fadeIn">
          <div className="flex items-center justify-between text-xs font-bold text-indigo-600 dark:text-indigo-400">
            <span className="flex items-center gap-1.5">
              <ArrowUpRight className="w-4 h-4" />
              Escalate to Senior Commander (Tier 3)
            </span>
            <button onClick={() => setModalMode('NONE')} className="text-soc-textMuted hover:text-soc-textPrimary text-xs font-semibold">✕</button>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-soc-textMuted block mb-1">Escalation Target Role:</label>
            <input
              type="text"
              value={escalateTo}
              onChange={(e) => setEscalateTo(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded bg-soc-card border border-soc-border text-xs text-soc-textPrimary focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-soc-textMuted block mb-1">Escalation Justification:</label>
            <input
              type="text"
              value={escalateReason}
              onChange={(e) => setEscalateReason(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded bg-soc-card border border-soc-border text-xs text-soc-textPrimary focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setModalMode('NONE')}
              className="px-3 py-1 rounded bg-soc-card border border-soc-border text-xs font-semibold text-soc-textSecondary"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onEscalate(escalateTo, escalateReason, activeAnalystName);
                setModalMode('NONE');
              }}
              className="px-3 py-1 rounded bg-indigo-600 text-white text-xs font-bold"
            >
              Confirm Escalation
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
