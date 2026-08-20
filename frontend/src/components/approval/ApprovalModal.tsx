import React from 'react';
import { Modal } from '../common/Modal';
import { ApprovalRequest } from '../../types/soc';
import { AlertOctagon, CheckCircle2 } from 'lucide-react';

interface Props {
  isOpen: boolean;
  request: ApprovalRequest | null;
  onClose: () => void;
  onConfirmApprove: (requestId: string) => void;
}

const riskLabel = (score: number) =>
  score >= 85 ? 'Critical' : score >= 70 ? 'High' : score >= 50 ? 'Medium' : 'Low';

export const ApprovalModal: React.FC<Props> = ({ isOpen, request, onClose, onConfirmApprove }) => {
  if (!request) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Confirm Human Governance Authorization"
      subtitle={`Incident Target: ${request.incidentId}`}
    >
      <div className="space-y-4 font-sans text-xs">
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 text-amber-800 dark:text-amber-300 flex items-start gap-3">
          <AlertOctagon className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-bold text-sm text-soc-textPrimary">Confirm Containment Action</h4>
            <p className="text-soc-textSecondary font-sans leading-relaxed">
              You are about to authorize: <strong className="text-amber-800 dark:text-amber-300 font-mono">{request.actionTitle}</strong>.
            </p>
          </div>
        </div>

        <div className="p-3 bg-soc-secondaryCard border border-soc-border rounded-lg space-y-2 text-soc-textSecondary">
          <div><strong className="text-soc-textMuted">AI Confidence:</strong> <span className="text-soc-ai font-bold">{request.aiConfidence}%</span></div>
          <div><strong className="text-soc-textMuted">Risk Assessment:</strong> <span className="text-red-600 dark:text-red-400 font-bold">{request.riskScore}% {riskLabel(request.riskScore)}</span></div>
          <div><strong className="text-soc-textMuted">Authorization Scope:</strong> This approval and its audit entry are real. No live EDR/firewall integration exists, so no real network hardware or account is affected.</div>
        </div>

        <div className="pt-2 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-soc-card border border-soc-border text-soc-textSecondary hover:text-soc-textPrimary hover:bg-soc-cardHover cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirmApprove(request.id)}
            className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 shadow-sm cursor-pointer transition-all"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>CONFIRM APPROVAL</span>
          </button>
        </div>
      </div>
    </Modal>
  );
};
