import React, { useState } from 'react';
import { X, ArrowUpRight, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { ApprovalRequest } from '../../types/soc';

interface Props {
  isOpen: boolean;
  request: ApprovalRequest | null;
  onClose: () => void;
  onConfirmEscalate: (requestId: string, escalateTo: string, reason: string) => void;
}

export const EscalateModal: React.FC<Props> = ({
  isOpen,
  request,
  onClose,
  onConfirmEscalate,
}) => {
  const [reason, setReason] = useState<string>('');

  if (!isOpen || !request) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 10) return;
    onConfirmEscalate(request.id, 'next_role', reason);
    setReason('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-soc-card border border-soc-border rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl animate-fade-in font-sans">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-soc-card via-soc-card to-red-500/10 border-b border-soc-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/60 border border-red-300 dark:border-red-700 text-red-800 dark:text-red-300">
              <ArrowUpRight className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-soc-textPrimary tracking-wide">
                Escalate Incident Decision
              </h2>
              <p className="text-xs text-soc-textMuted">Request: {request.id} | Incident: {request.incidentId}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-soc-textMuted hover:text-soc-textPrimary hover:bg-soc-cardHover transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div className="p-3 rounded-xl bg-soc-secondaryCard border border-soc-border">
            <span className="text-[10px] text-soc-textMuted font-bold block uppercase">Target Action for Escalation</span>
            <div className="text-soc-textPrimary font-bold font-mono text-sm mt-0.5">{request.actionTitle}</div>
          </div>

          <div className="p-3 rounded-xl bg-soc-secondaryCard border border-soc-border text-[11px] text-soc-textSecondary font-sans">
            The escalation target is set by policy (the next authorization level above your role), not chosen manually — this keeps an analyst from routing a decision to whoever they like.
          </div>

          <div className="space-y-1.5">
            <label className="block text-soc-textPrimary font-bold uppercase tracking-wider text-[11px]">
              Escalation Justification Reason:
            </label>
            <textarea
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="State clear operational reason for escalating this decision (e.g. potential business downtime, uncertain lateral impact)..."
              className="w-full p-3 rounded-xl bg-soc-secondaryCard border border-soc-border text-soc-textPrimary placeholder:text-soc-textMuted font-sans focus:border-red-500 focus:outline-none"
            />
            <p className="text-[10px] text-soc-textMuted mt-1">
              {reason.trim().length < 10 ? `At least ${10 - reason.trim().length} more character(s) required.` : 'Reason length OK.'}
            </p>
          </div>

          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 text-red-800 dark:text-red-300 text-[11px] flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
            <span>Status will update to ESCALATED and notify designated senior personnel.</span>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-soc-border flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-soc-card hover:bg-soc-cardHover border border-soc-border text-soc-textSecondary hover:text-soc-textPrimary font-bold transition-colors cursor-pointer"
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={reason.trim().length < 10}
              className="px-5 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>CONFIRM ESCALATION</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
