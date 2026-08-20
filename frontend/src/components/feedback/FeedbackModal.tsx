import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { CheckCircle2, AlertTriangle, Edit3 } from 'lucide-react';
import { Severity } from '../../types/soc';

interface Props {
  isOpen: boolean;
  incidentId: string;
  onClose: () => void;
  onSubmit: (decision: 'CONFIRM' | 'FALSE_POSITIVE' | 'MODIFY', reason?: string, newSeverity?: Severity) => void;
}

export const FeedbackModal: React.FC<Props> = ({ isOpen, incidentId, onClose, onSubmit }) => {
  const [decision, setDecision] = useState<'CONFIRM' | 'FALSE_POSITIVE' | 'MODIFY'>('CONFIRM');
  const [reason, setReason] = useState('');
  const [newSeverity, setNewSeverity] = useState<Severity>('MEDIUM');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(decision, reason, decision === 'MODIFY' ? newSeverity : undefined);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Submit Analyst Feedback (RLHF Loop)"
      subtitle={`Target Incident: ${incidentId}`}
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs font-sans">
        <div>
          <label className="block text-soc-textMuted font-bold uppercase tracking-wider text-[10px] mb-2">
            Select Feedback Decision:
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setDecision('CONFIRM')}
              className={`p-3 rounded-lg border flex flex-col items-center gap-1 font-bold transition-all cursor-pointer ${
                decision === 'CONFIRM'
                  ? 'border-emerald-400 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 shadow-sm'
                  : 'border-soc-border bg-soc-secondaryCard text-soc-textMuted hover:bg-soc-cardHover'
              }`}
            >
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <span>Confirm Threat</span>
            </button>

            <button
              type="button"
              onClick={() => setDecision('FALSE_POSITIVE')}
              className={`p-3 rounded-lg border flex flex-col items-center gap-1 font-bold transition-all cursor-pointer ${
                decision === 'FALSE_POSITIVE'
                  ? 'border-red-400 dark:border-red-500 bg-red-50 dark:bg-red-950/60 text-red-800 dark:text-red-300 shadow-sm'
                  : 'border-soc-border bg-soc-secondaryCard text-soc-textMuted hover:bg-soc-cardHover'
              }`}
            >
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
              <span>False Positive</span>
            </button>

            <button
              type="button"
              onClick={() => setDecision('MODIFY')}
              className={`p-3 rounded-lg border flex flex-col items-center gap-1 font-bold transition-all cursor-pointer ${
                decision === 'MODIFY'
                  ? 'border-amber-400 dark:border-amber-500 bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 shadow-sm'
                  : 'border-soc-border bg-soc-secondaryCard text-soc-textMuted hover:bg-soc-cardHover'
              }`}
            >
              <Edit3 className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              <span>Modify Severity</span>
            </button>
          </div>
        </div>

        {decision === 'MODIFY' && (
          <div>
            <label className="block text-soc-textMuted font-bold mb-1">Adjusted Severity Level:</label>
            <select
              value={newSeverity}
              onChange={(e) => setNewSeverity(e.target.value as Severity)}
              className="w-full p-2.5 rounded-lg bg-soc-secondaryCard border border-soc-border text-soc-textPrimary font-mono cursor-pointer"
            >
              <option value="CRITICAL">CRITICAL</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
            </select>
          </div>
        )}

        {(decision === 'FALSE_POSITIVE' || decision === 'MODIFY') && (
          <div>
            <label className="block text-soc-textMuted font-bold mb-1">Feedback Explanation / Reason:</label>
            <textarea
              rows={3}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Authorized admin maintenance script activity."
              className="w-full p-3 rounded-lg bg-soc-secondaryCard border border-soc-border text-soc-textPrimary placeholder:text-soc-textMuted font-sans"
            />
          </div>
        )}

        <div className="pt-3 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-soc-card border border-soc-border text-soc-textSecondary hover:text-soc-textPrimary hover:bg-soc-cardHover cursor-pointer">
            Cancel
          </button>
          <button type="submit" className="px-5 py-2 rounded-lg bg-soc-accent text-white font-bold hover:brightness-110 cursor-pointer">
            Submit Feedback
          </button>
        </div>
      </form>
    </Modal>
  );
};
