import React, { useState, useEffect } from 'react';
import { X, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { ApprovalRequest, ActionAlternative } from '../../types/soc';

interface Props {
  isOpen: boolean;
  request: ApprovalRequest | null;
  alternatives: ActionAlternative[];
  initialSelectedTitle?: string;
  onClose: () => void;
  onConfirmOverride: (requestId: string, selectedActionTitle: string, reason: string) => void;
}

export const OverrideModal: React.FC<Props> = ({
  isOpen,
  request,
  alternatives,
  initialSelectedTitle,
  onClose,
  onConfirmOverride,
}) => {
  const [selectedAction, setSelectedAction] = useState<string>('');
  const [reason, setReason] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setSelectedAction(initialSelectedTitle || alternatives[0]?.title || 'Custom Manual Containment Policy');
    }
  }, [isOpen, initialSelectedTitle, alternatives]);

  if (!isOpen || !request) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 10) return;
    onConfirmOverride(request.id, selectedAction, reason);
    setReason('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-soc-card border border-soc-border rounded-2xl max-w-xl w-full overflow-hidden shadow-2xl animate-fade-in font-sans">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-soc-card via-soc-card to-amber-500/10 border-b border-soc-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/60 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-soc-textPrimary tracking-wide">
                Human Analyst Control Override
              </h2>
              <p className="text-xs text-soc-textMuted">Override AI Recommendation for {request.id}</p>
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
          {/* AI Original vs Human Selected */}
          <div className="p-3.5 rounded-xl bg-soc-secondaryCard border border-soc-border space-y-2">
            <div className="text-soc-textMuted text-[11px]">
              <strong className="text-soc-ai font-mono">AI Recommended Action:</strong>
              <div className="text-soc-textPrimary font-mono mt-0.5 line-through opacity-75">{request.actionTitle}</div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-soc-textPrimary font-bold uppercase tracking-wider text-[11px]">
              Select Human Override Response Action:
            </label>
            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
              className="w-full p-3 rounded-xl bg-soc-secondaryCard border border-soc-border text-soc-textPrimary font-mono focus:border-amber-500 focus:outline-none cursor-pointer"
            >
              {alternatives.map((alt) => (
                <option key={alt.id} value={alt.title}>
                  {alt.title} ({alt.tier})
                </option>
              ))}
              <option value="Custom Manual Containment Policy">Custom Manual Isolation / Containment Policy</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-soc-textPrimary font-bold uppercase tracking-wider text-[11px]">
              Mandatory Override Justification Reason:
            </label>
            <textarea
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Provide explicit operational/analytical rationale for overriding AI recommendation..."
              className="w-full p-3 rounded-xl bg-soc-secondaryCard border border-soc-border text-soc-textPrimary placeholder:text-soc-textMuted font-sans focus:border-amber-500 focus:outline-none"
            />
            <p className="text-[10px] text-soc-textMuted mt-1">
              {reason.trim().length < 10 ? `At least ${10 - reason.trim().length} more character(s) required.` : 'Reason length OK.'}
            </p>
          </div>

          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 text-[11px] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>This override event will be logged with analyst identity and timestamp in the cryptographically hashed audit log.</span>
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
              className="px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>SUBMIT HUMAN OVERRIDE</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
