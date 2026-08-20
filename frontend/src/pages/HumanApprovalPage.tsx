import React, { useState } from 'react';
import { CheckSquare, ShieldCheck, Filter } from 'lucide-react';
import { ApprovalCard } from '../components/approval/ApprovalCard';
import { ApprovalModal } from '../components/approval/ApprovalModal';
import { RejectionModal } from '../components/approval/RejectionModal';
import { AskWhyModal } from '../components/approval/AskWhyModal';
import { AlternativesModal } from '../components/approval/AlternativesModal';
import { OverrideModal } from '../components/approval/OverrideModal';
import { EscalateModal } from '../components/approval/EscalateModal';
import { UndoModal } from '../components/approval/UndoModal';
import { useSOC } from '../components/common/SOCContext';
import { ApprovalRequest } from '../types/soc';

export const HumanApprovalPage: React.FC = () => {
  const { approvals, approveRequest, rejectRequest, overrideRequest, escalateRequest, rollbackAction, authUser, aiAnalyses } = useSOC();
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'ESCALATED' | 'REJECTED'>('ALL');

  // Modals state
  const [selectedApproveReq, setSelectedApproveReq] = useState<ApprovalRequest | null>(null);
  const [selectedRejectReq, setSelectedRejectReq] = useState<ApprovalRequest | null>(null);
  const [selectedAskWhyReq, setSelectedAskWhyReq] = useState<ApprovalRequest | null>(null);
  const [selectedAlternativesReq, setSelectedAlternativesReq] = useState<ApprovalRequest | null>(null);
  const [selectedOverrideReq, setSelectedOverrideReq] = useState<ApprovalRequest | null>(null);
  const [overridePreselectTitle, setOverridePreselectTitle] = useState<string>('');
  const [selectedEscalateReq, setSelectedEscalateReq] = useState<ApprovalRequest | null>(null);
  const [selectedUndoReq, setSelectedUndoReq] = useState<ApprovalRequest | null>(null);
  const activeAnalystPersona = authUser ? `${authUser.name} (${authUser.role})` : 'Unknown Analyst';

  const handleApproveClick = (req: ApprovalRequest, analystName?: string) => {
    const approverName = analystName || activeAnalystPersona;
    approveRequest(req.id, approverName);
  };

  const handleConfirmApproveModal = (requestId: string) => {
    approveRequest(requestId, activeAnalystPersona);
    setSelectedApproveReq(null);
  };

  const handleConfirmReject = (requestId: string, reason: string) => {
    rejectRequest(requestId, activeAnalystPersona, reason);
    setSelectedRejectReq(null);
  };

  const handleConfirmOverride = (requestId: string, selectedActionTitle: string, reason: string) => {
    overrideRequest(requestId, selectedActionTitle, reason, activeAnalystPersona);
    setSelectedOverrideReq(null);
  };

  const handleConfirmEscalate = (requestId: string, escalateTo: string, reason: string) => {
    escalateRequest(requestId, escalateTo, reason, activeAnalystPersona);
    setSelectedEscalateReq(null);
  };

  const handleConfirmUndo = (actionId: string) => {
    rollbackAction(actionId, activeAnalystPersona);
    setSelectedUndoReq(null);
  };

  const filtered = approvals.filter((r) => {
    if (activeFilter === 'ALL') return true;
    if (activeFilter === 'PENDING') return r.status === 'PENDING' || r.status === 'PARTIALLY_APPROVED';
    return r.status === activeFilter;
  });

  return (
    <div className="space-y-5 font-sans">
      {/* Header Banner */}
      <div className="p-4 rounded-xl bg-soc-card border border-soc-border flex flex-wrap items-center justify-between gap-4 shadow-soc-card">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-amber-600 dark:text-amber-400 mb-0.5">
            <CheckSquare className="w-4 h-4" />
            <span>HUMAN GOVERNANCE & AUTHORIZATION CENTER</span>
          </div>
          <h1 className="text-lg font-extrabold text-soc-textPrimary tracking-tight">
            Human-in-the-Loop Governance & Authorization Queue
          </h1>
          <p className="text-[11px] text-soc-textMuted mt-0.5">
            Tier 0–3 Governance | Five Human Controls (Approve, Override, Ask Why, Alternatives, Escalate)
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-600/80 text-amber-800 dark:text-amber-300 font-bold text-xs shadow-sm dark:shadow-glow-amber">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Safety Interlock Active</span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-soc-textMuted" />
          <span className="text-soc-textMuted font-bold mr-1 text-[11px]">Filter Queue:</span>
          {(['ALL', 'PENDING', 'APPROVED', 'ESCALATED', 'REJECTED'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setActiveFilter(st)}
              className={`px-2.5 py-1 rounded-md border font-bold transition-all text-xs cursor-pointer ${
                activeFilter === st
                  ? 'bg-soc-accent text-white border-soc-accent shadow-sm'
                  : 'bg-soc-card border-soc-border text-soc-textMuted hover:text-soc-textPrimary'
              }`}
            >
              {st} (
              {
                approvals.filter((r) => {
                  if (st === 'ALL') return true;
                  if (st === 'PENDING') return r.status === 'PENDING' || r.status === 'PARTIALLY_APPROVED';
                  return r.status === st;
                }).length
              }
              )
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-soc-textMuted text-xs">
          <span className="text-[11px]">Acting Analyst:</span>
          <span className="text-soc-cyan font-bold px-2 py-1 bg-soc-secondaryCard border border-soc-border rounded-md text-xs">
            {activeAnalystPersona}
          </span>
        </div>
      </div>

      {/* Approvals Cards List */}
      <div className="space-y-3.5">
        {filtered.length > 0 ? (
          filtered.map((req) => (
            <ApprovalCard
              key={req.id}
              request={req}
              authUser={authUser}
              onApprove={handleApproveClick}
              onReject={(r) => setSelectedRejectReq(r)}
              onAskWhy={(r) => setSelectedAskWhyReq(r)}
              onAlternatives={(r) => setSelectedAlternativesReq(r)}
              onOverride={(r) => {
                setSelectedOverrideReq(r);
                setOverridePreselectTitle('');
              }}
              onEscalate={(r) => setSelectedEscalateReq(r)}
              onUndo={(r) => setSelectedUndoReq(r)}
            />
          ))
        ) : (
          <div className="p-8 text-center rounded-xl bg-soc-card border border-soc-border text-soc-textMuted font-mono text-xs">
            No approval requests matching status "{activeFilter}".
          </div>
        )}
      </div>

      {/* Approve Confirmation Modal */}
      <ApprovalModal
        isOpen={!!selectedApproveReq}
        request={selectedApproveReq}
        onClose={() => setSelectedApproveReq(null)}
        onConfirmApprove={handleConfirmApproveModal}
      />

      {/* Reject Justification Modal */}
      <RejectionModal
        isOpen={!!selectedRejectReq}
        request={selectedRejectReq}
        onClose={() => setSelectedRejectReq(null)}
        onConfirmReject={handleConfirmReject}
      />

      {/* 3. Ask Why Explanation Modal */}
      <AskWhyModal
        isOpen={!!selectedAskWhyReq}
        request={selectedAskWhyReq}
        onClose={() => setSelectedAskWhyReq(null)}
      />

      {/* 4. Alternatives Comparison Modal */}
      <AlternativesModal
        isOpen={!!selectedAlternativesReq}
        request={selectedAlternativesReq}
        alternatives={
          selectedAlternativesReq ? aiAnalyses[selectedAlternativesReq.incidentId]?.decisionSupport.alternatives || [] : []
        }
        onClose={() => setSelectedAlternativesReq(null)}
        onSelectOverride={(altTitle) => {
          setSelectedOverrideReq(selectedAlternativesReq);
          setOverridePreselectTitle(altTitle);
          setSelectedAlternativesReq(null);
        }}
      />

      {/* 2. Override Justification Modal */}
      <OverrideModal
        isOpen={!!selectedOverrideReq}
        request={selectedOverrideReq}
        alternatives={
          selectedOverrideReq ? aiAnalyses[selectedOverrideReq.incidentId]?.decisionSupport.alternatives || [] : []
        }
        initialSelectedTitle={overridePreselectTitle}
        onClose={() => setSelectedOverrideReq(null)}
        onConfirmOverride={handleConfirmOverride}
      />

      {/* 5. Escalate Modal */}
      <EscalateModal
        isOpen={!!selectedEscalateReq}
        request={selectedEscalateReq}
        onClose={() => setSelectedEscalateReq(null)}
        onConfirmEscalate={handleConfirmEscalate}
      />

      {/* Rollback / Undo Modal */}
      <UndoModal
        isOpen={!!selectedUndoReq}
        actionTitle={selectedUndoReq?.actionTitle || ''}
        actionId={selectedUndoReq?.actionId || selectedUndoReq?.id || ''}
        onClose={() => setSelectedUndoReq(null)}
        onConfirmUndo={handleConfirmUndo}
      />
    </div>
  );
};

