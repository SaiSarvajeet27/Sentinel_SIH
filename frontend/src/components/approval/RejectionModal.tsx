import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { ApprovalRequest } from '../../types/soc';
import { XCircle } from 'lucide-react';

interface Props {
  isOpen: boolean;
  request: ApprovalRequest | null;
  onClose: () => void;
  onConfirmReject: (requestId: string, reason: string) => void;
}

export const RejectionModal: React.FC<Props> = ({ isOpen, request, onClose, onConfirmReject }) => {
  const [reason, setReason] = useState('');

  if (!request) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 10) return;
    onConfirmReject(request.id, reason);
    setReason('');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Reject Action Request"
      subtitle={`Incident Target: ${request.incidentId}`}
    >
      <form onSubmit={handleSubmit} className="space-y-4 font-mono text-xs">
        <p className="text-soc-textSecondary font-sans">
          Please provide a mandatory justification for rejecting AI recommendation: <strong className="text-soc-textPrimary font-mono">{request.actionTitle}</strong>.
        </p>

        <div>
          <label className="block text-soc-textMuted font-bold mb-1 uppercase tracking-wider text-[10px]">
            Rejection Justification Reason:
          </label>
          <textarea
            required
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Host device is mission-critical lab server undergoing scheduled stress testing. False positive trigger confirmed."
            className="w-full p-3 rounded-lg bg-soc-secondaryCard border border-soc-border text-soc-textPrimary placeholder:text-soc-textMuted focus:outline-none focus:border-red-500 font-sans text-xs"
          />
          <p className="text-[10px] text-soc-textMuted mt-1">
            {reason.trim().length < 10 ? `At least ${10 - reason.trim().length} more character(s) required.` : 'Reason length OK.'}
          </p>
        </div>

        <div className="pt-2 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-soc-card border border-soc-border text-soc-textSecondary hover:text-soc-textPrimary hover:bg-soc-cardHover cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={reason.trim().length < 10}
            className="px-5 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold flex items-center gap-1.5 shadow-sm cursor-pointer transition-all"
          >
            <XCircle className="w-4 h-4" />
            <span>SUBMIT REJECTION</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
