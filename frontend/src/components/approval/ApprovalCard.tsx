import React, { useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, ShieldCheck, Cpu, HelpCircle, Layers, RefreshCw, ArrowUpRight, Lock, UserCheck, Undo2 } from 'lucide-react';
import { ApprovalRequest, AuthUser } from '../../types/soc';
import { SeverityBadge } from '../common/SeverityBadge';
import { RiskScore } from '../common/RiskScore';
import { TierBadge } from '../common/TierBadge';

interface Props {
  request: ApprovalRequest;
  authUser: AuthUser | null;
  onApprove: (req: ApprovalRequest, analystName?: string) => void;
  onReject: (req: ApprovalRequest) => void;
  onOverride: (req: ApprovalRequest) => void;
  onAskWhy: (req: ApprovalRequest) => void;
  onAlternatives: (req: ApprovalRequest) => void;
  onEscalate: (req: ApprovalRequest) => void;
  onUndo?: (req: ApprovalRequest) => void;
}

export const ApprovalCard: React.FC<Props> = ({
  request,
  authUser,
  onApprove,
  onReject,
  onOverride,
  onAskWhy,
  onAlternatives,
  onEscalate,
  onUndo,
}) => {
  const selfIdentity = authUser ? `${authUser.name} (${authUser.role})` : 'Unknown Analyst';
  const [selectedAnalyst, setSelectedAnalyst] = useState<string>(selfIdentity);

  const isPending = request.status === 'PENDING';
  const isPartiallyApproved = request.status === 'PARTIALLY_APPROVED';
  const isApproved = request.status === 'APPROVED';
  const isEscalated = request.status === 'ESCALATED';
  const isReverted = request.status === 'REVERTED' || request.rollbackStatus === 'REVERTED';
  const isTier3 = request.tier === 'TIER_3';

  return (
    <div
      className={`p-5 rounded-xl border transition-all duration-200 bg-soc-card ${
        isTier3 && (isPending || isPartiallyApproved)
          ? 'border-purple-400 dark:border-purple-600/90 shadow-sm dark:shadow-glow-purple'
          : isPending || isPartiallyApproved
          ? 'border-amber-400 dark:border-amber-700/80 shadow-sm dark:shadow-glow-amber'
          : isApproved
          ? 'border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/50 dark:bg-emerald-950/20'
          : isEscalated
          ? 'border-blue-200 dark:border-blue-800/80 bg-blue-50/50 dark:bg-blue-950/20'
          : 'border-red-200 dark:border-red-800/80 bg-red-50/50 dark:bg-red-950/20'
      }`}
    >
      {/* Top Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-soc-border">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-soc-cyan">{request.id}</span>
            <span className="text-xs font-mono text-soc-textMuted">•</span>
            <span className="text-xs font-mono text-soc-textMuted font-bold">{request.incidentId}</span>
            <SeverityBadge severity={request.severity} size="sm" />
            <TierBadge tier={request.tier || 'TIER_2'} size="sm" />
          </div>
          <h3 className="text-base font-bold text-soc-textPrimary mt-1 flex items-center gap-2">
            {request.actionTitle}
          </h3>
        </div>

        <div className="flex items-center gap-3">
          <RiskScore score={request.riskScore} size="sm" />
          <span className="text-xs font-mono text-purple-800 dark:text-purple-300 bg-purple-100 dark:bg-purple-950/60 border border-purple-300 dark:border-purple-800 px-2 py-0.5 rounded font-bold">
            AI Conf: {request.aiConfidence}%
          </span>
        </div>
      </div>

      {/* Governance & Action Scope Banner */}
      <div className="mt-3 p-3 rounded-lg bg-soc-secondaryCard border border-soc-border grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px] font-mono text-soc-textSecondary">
        <div>
          <span className="text-soc-textMuted block text-[9px] uppercase font-bold">Affected Scope:</span>
          <span className="text-soc-textPrimary font-bold">{request.affectedScope || '1 target'}</span>
        </div>
        <div>
          <span className="text-soc-textMuted block text-[9px] uppercase font-bold">Reversibility:</span>
          <span className={`font-bold ${request.reversibility === 'NO' ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
            {request.reversibility || 'YES'}
          </span>
        </div>
        <div>
          <span className="text-soc-textMuted block text-[9px] uppercase font-bold">Authorization Level:</span>
          <span className="text-amber-600 dark:text-amber-400 font-bold">{request.requiredAuthorization || (isTier3 ? 'TWO APPROVERS REQUIRED' : 'HUMAN APPROVAL REQUIRED')}</span>
        </div>
      </div>

      {/* Tier 3 Two-Approver Progress Widget */}
      {isTier3 && (
        <div className="mt-3 p-3 rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60 font-mono text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-purple-800 dark:text-purple-300 flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
              <Lock className="w-3.5 h-3.5 text-soc-ai" />
              Tier 3 Authorization Matrix (Two Approvers Required)
            </span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isApproved ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800' : 'bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 border border-purple-300 dark:border-purple-700'}`}>
              {isApproved ? '2 / 2 APPROVED' : isPartiallyApproved ? '1 / 2 APPROVED (ACTION STILL LOCKED)' : '0 / 2 APPROVED (LOCKED)'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className={`p-2 rounded border flex items-center justify-between ${request.approver1 ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300' : 'bg-soc-secondaryCard border-soc-border text-soc-textMuted'}`}>
              <span className="font-bold">Approver 1:</span>
              <span>{request.approver1 ? `✅ ${request.approver1.analystName}` : '⏳ PENDING'}</span>
            </div>
            <div className={`p-2 rounded border flex items-center justify-between ${request.approver2 ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300' : 'bg-soc-secondaryCard border-soc-border text-soc-textMuted'}`}>
              <span className="font-bold">Approver 2:</span>
              <span>{request.approver2 ? `✅ ${request.approver2.analystName}` : '⏳ PENDING'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Reason for Action */}
      <div className="my-3 space-y-2 text-xs font-mono">
        <p className="text-soc-textSecondary bg-soc-secondaryCard p-3 rounded-lg border border-soc-border leading-relaxed font-sans">
          <span className="font-bold text-amber-600 dark:text-amber-400 font-mono uppercase block mb-1">Reason for AI Recommendation:</span>
          {request.reason}
        </p>

        {request.overrideDetails && (
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs font-mono text-amber-800 dark:text-amber-200 space-y-1">
            <div className="font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" />
              HUMAN ANALYST OVERRIDE RECORDED
            </div>
            <div>Original Recommendation: <span className="line-through text-soc-textMuted">{request.overrideDetails.originalActionTitle}</span></div>
            <div>Selected Override Action: <strong className="text-soc-textPrimary">{request.overrideDetails.selectedActionTitle}</strong></div>
            <div>Analyst Reason: <span className="font-sans text-soc-textSecondary">{request.overrideDetails.overrideReason}</span></div>
          </div>
        )}

        {request.escalationDetails && (
          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs font-mono text-blue-800 dark:text-blue-200 space-y-1">
            <div className="font-bold text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
              <ArrowUpRight className="w-3.5 h-3.5" />
              DECISION ESCALATED TO {request.escalationDetails.escalatedTo.toUpperCase()}
            </div>
            <div>Escalation Reason: <span className="font-sans text-soc-textSecondary">{request.escalationDetails.escalationReason}</span></div>
            <div>Escalated By: <strong>{request.escalationDetails.analystName}</strong> at {request.escalationDetails.timestamp}</div>
          </div>
        )}

        <div className="flex items-center justify-between text-soc-textMuted text-[11px] pt-1">
          <div className="flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-soc-accent" />
            <span>Supporting Telemetry Events: <strong className="text-soc-textPrimary">{request.supportingEventsCount} events</strong></span>
          </div>
          <span>Requested: {request.requestedAt}</span>
        </div>
      </div>

      {/* Footer / Five Human Controls Toolbar */}
      <div className="pt-2.5 border-t border-soc-border space-y-2.5">
        {isPending || isPartiallyApproved ? (
          <div className="space-y-2.5">
            {/* Analyst Simulation Persona Selector for Two-Approver Demo */}
            {isTier3 && (
              <div className="flex items-center justify-between bg-purple-50 dark:bg-purple-950/40 p-2 rounded border border-purple-200 dark:border-purple-800/80 text-[11px] font-mono">
                <span className="text-purple-800 dark:text-purple-300 font-bold flex items-center gap-1">
                  <UserCheck className="w-3.5 h-3.5" />
                  Signing as{isPartiallyApproved ? ' (2nd approver — two-person rule demo)' : ''}:
                </span>
                {isPartiallyApproved ? (
                  <input
                    value={selectedAnalyst}
                    onChange={(e) => setSelectedAnalyst(e.target.value)}
                    placeholder="Second approver name"
                    className="bg-soc-card border border-soc-border text-soc-textPrimary text-xs font-mono px-2 py-1 rounded focus:outline-none w-56"
                  />
                ) : (
                  <span className="text-soc-textPrimary font-bold">{selfIdentity}</span>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 font-mono font-semibold">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Governance Control Interlock Active</span>
              </div>

              {/* FIVE HUMAN CONTROLS BUTTONS */}
              <div className="flex flex-wrap items-center gap-1.5">
                {/* 3. ASK WHY */}
                <button
                  onClick={() => onAskWhy(request)}
                  className="px-2.5 py-1.5 rounded-lg border border-purple-300 dark:border-purple-800 bg-purple-100 dark:bg-purple-950/60 hover:bg-purple-200 dark:hover:bg-purple-900 text-purple-800 dark:text-purple-300 font-bold font-mono text-xs transition-colors flex items-center gap-1 cursor-pointer"
                  title="View AI reasoning & evidence breakdown"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>ASK WHY</span>
                </button>

                {/* 4. ALTERNATIVES */}
                <button
                  onClick={() => onAlternatives(request)}
                  className="px-2.5 py-1.5 rounded-lg border border-blue-300 dark:border-blue-800 bg-blue-100 dark:bg-blue-950/60 hover:bg-blue-200 dark:hover:bg-blue-900 text-blue-800 dark:text-blue-300 font-bold font-mono text-xs transition-colors flex items-center gap-1 cursor-pointer"
                  title="View alternative response playbooks"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>ALTERNATIVES</span>
                </button>

                {/* 2. OVERRIDE */}
                <button
                  onClick={() => onOverride(request)}
                  className="px-2.5 py-1.5 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-100 dark:bg-amber-950/60 hover:bg-amber-200 dark:hover:bg-amber-900 text-amber-800 dark:text-amber-300 font-bold font-mono text-xs transition-colors flex items-center gap-1 cursor-pointer"
                  title="Override AI recommendation with alternative response"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>OVERRIDE</span>
                </button>

                {/* 5. ESCALATE */}
                <button
                  onClick={() => onEscalate(request)}
                  className="px-2.5 py-1.5 rounded-lg border border-soc-border bg-soc-secondaryCard hover:bg-soc-cardHover text-soc-textSecondary hover:text-soc-textPrimary font-bold font-mono text-xs transition-colors flex items-center gap-1 cursor-pointer"
                  title="Escalate decision to Senior Lead"
                >
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  <span>ESCALATE</span>
                </button>

                {/* Reject */}
                <button
                  onClick={() => onReject(request)}
                  className="px-2.5 py-1.5 rounded-lg border border-red-300 dark:border-red-800 bg-red-100 dark:bg-red-950/60 hover:bg-red-200 dark:hover:bg-red-900 text-red-800 dark:text-red-300 font-bold font-mono text-xs transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>REJECT</span>
                </button>

                {/* 1. APPROVE */}
                <button
                  onClick={() => onApprove(request, selectedAnalyst)}
                  className="px-3.5 py-1.5 rounded-lg border border-emerald-600 bg-emerald-600 hover:bg-emerald-500 text-white font-bold font-mono text-xs transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{isTier3 && isPartiallyApproved ? 'SIGN APPROVAL 2/2' : isTier3 ? 'SIGN APPROVAL 1/2' : 'APPROVE'}</span>
                </button>
              </div>
            </div>
          </div>
        ) : isApproved ? (
          <div className="flex flex-wrap items-center justify-between gap-2 w-full text-xs font-mono">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold">
              <ShieldCheck className="w-4 h-4" />
              <span>ACTION APPROVED & EXECUTED</span>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-soc-textMuted">
                Approved by: <strong className="text-soc-textPrimary">{request.decidedBy}</strong>
              </span>

              {onUndo && request.reversibility !== 'NO' && !isReverted && (
                <button
                  onClick={() => onUndo(request)}
                  className="px-3 py-1 rounded bg-amber-100 dark:bg-amber-950/80 hover:bg-amber-200 dark:hover:bg-amber-900 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Undo2 className="w-3 h-3" />
                  <span>UNDO / ROLLBACK</span>
                </button>
              )}
            </div>
          </div>
        ) : isReverted ? (
          <div className="flex items-center justify-between w-full text-xs font-mono text-amber-600 dark:text-amber-400 font-bold">
            <div className="flex items-center gap-2">
              <Undo2 className="w-4 h-4" />
              <span>ACTION REVERTED (ROLLBACK COMPLETED)</span>
            </div>
            <span className="text-soc-textMuted">Baseline network state restored</span>
          </div>
        ) : (
          <div className="flex flex-col gap-1 w-full text-xs font-mono">
            <div className="flex items-center justify-between text-red-600 dark:text-red-400 font-bold">
              <div className="flex items-center gap-2">
                <XCircle className="w-4 h-4" />
                <span>ACTION REJECTED BY ANALYST</span>
              </div>
              <span className="text-soc-textMuted">Decided by: {request.decidedBy}</span>
            </div>
            {request.rejectionReason && (
              <p className="text-[11px] text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-950/40 p-2 rounded border border-red-200 dark:border-red-900 font-sans">
                Reason: {request.rejectionReason}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

