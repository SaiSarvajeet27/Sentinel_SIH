import React from 'react';
import { X, Undo2, AlertTriangle, ShieldCheck } from 'lucide-react';

interface Props {
  isOpen: boolean;
  actionTitle: string;
  actionId: string;
  onClose: () => void;
  onConfirmUndo: (actionId: string) => void;
}

export const UndoModal: React.FC<Props> = ({
  isOpen,
  actionTitle,
  actionId,
  onClose,
  onConfirmUndo,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-soc-card border border-soc-border rounded-2xl max-w-md w-full overflow-hidden shadow-2xl animate-fade-in font-sans">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-soc-card via-soc-card to-amber-500/10 border-b border-soc-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/60 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300">
              <Undo2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-soc-textPrimary tracking-wide">
                Undo / Rollback Action?
              </h2>
              <p className="text-xs text-soc-textMuted">Revert an Executed Response Action</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-soc-textMuted hover:text-soc-textPrimary hover:bg-soc-cardHover transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 text-xs">
          <div className="p-3.5 rounded-xl bg-soc-secondaryCard border border-soc-border space-y-1">
            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold uppercase block">Target Executed Action:</span>
            <div className="text-soc-textPrimary font-bold font-mono text-sm">{actionTitle}</div>
          </div>

          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 space-y-1">
            <div className="flex items-center gap-1.5 font-bold">
              <ShieldCheck className="w-4 h-4 text-soc-cyan" />
              <span>Restorative Protocol</span>
            </div>
            <p className="text-[11px] font-sans text-soc-textSecondary leading-relaxed">
              Confirming rollback flips this action's status back and appends a cryptographically signed revert entry in the real audit ledger — that part is not simulated.
            </p>
          </div>

          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-300 text-[11px] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>Note: This console has no live EDR/firewall integration, so no real network adapter or credential is touched by this or the original action — only the governance and audit state.</span>
          </div>

          {/* Footer */}
          <div className="pt-3 border-t border-soc-border flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-soc-card hover:bg-soc-cardHover border border-soc-border text-soc-textSecondary hover:text-soc-textPrimary font-bold transition-colors cursor-pointer"
            >
              CANCEL
            </button>
            <button
              onClick={() => {
                onConfirmUndo(actionId);
                onClose();
              }}
              className="px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <Undo2 className="w-4 h-4" />
              <span>CONFIRM UNDO</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
