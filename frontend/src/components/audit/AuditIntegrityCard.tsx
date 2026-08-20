import React, { useState } from 'react';
import { ShieldCheck, ShieldAlert, CheckCircle2, AlertOctagon } from 'lucide-react';
import { useSOC } from '../common/SOCContext';
import { VerifyChainModal } from './VerifyChainModal';
import { TamperTestModal } from './TamperTestModal';

interface Props {
  onViewEntry?: (entryId: string) => void;
}

export const AuditIntegrityCard: React.FC<Props> = ({ onViewEntry }) => {
  const { auditIntegrity } = useSOC();
  const [isVerifyOpen, setIsVerifyOpen] = useState(false);
  const [isTamperOpen, setIsTamperOpen] = useState(false);

  const isValid = auditIntegrity.status === 'VALID';

  return (
    <>
      <div className="p-4 rounded-xl bg-soc-card border border-soc-border space-y-4 font-sans text-xs shadow-soc-card">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-soc-border pb-3">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-lg border ${isValid ? 'bg-emerald-100 dark:bg-emerald-950/80 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 shadow-sm dark:shadow-glow-cyan' : 'bg-red-100 dark:bg-red-950/80 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 shadow-sm dark:shadow-glow-red'}`}>
              {isValid ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
            </div>
            <div>
              <h2 className="text-xs font-extrabold text-soc-textPrimary tracking-wider uppercase">
                AUDIT LOG INTEGRITY & CRYPTOGRAPHIC VERIFICATION
              </h2>
              <p className="text-soc-textMuted text-[10px] font-sans">
                Tamper-Evident Hash Chain & Digital Signature Verification
              </p>
            </div>
          </div>

          <div className={`px-2.5 py-0.5 rounded-full border text-xs font-extrabold flex items-center gap-1.5 ${
            isValid
              ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700'
              : 'bg-red-100 dark:bg-red-950/80 text-red-800 dark:text-red-400 border-red-300 dark:border-red-700 animate-pulse'
          }`}>
            {isValid ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertOctagon className="w-3.5 h-3.5" />}
            <span className="text-[11px]">{isValid ? '🟢 CHAIN VALID' : '🔴 CHAIN INTEGRITY VIOLATION'}</span>
          </div>
        </div>

        {/* Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-lg bg-soc-secondaryCard border border-soc-border text-center">
          <div>
            <span className="text-[9px] text-soc-textMuted uppercase font-bold block">Entries Checked</span>
            <span className="text-sm font-extrabold text-soc-textPrimary">{auditIntegrity.entriesChecked.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-[9px] text-soc-textMuted uppercase font-bold block">Hash Algorithm</span>
            <span className="text-sm font-extrabold text-soc-cyan">{auditIntegrity.algorithm}</span>
          </div>
          <div>
            <span className="text-[9px] text-soc-textMuted uppercase font-bold block">Signature Scheme</span>
            <span className="text-sm font-extrabold text-soc-ai">{auditIntegrity.signature}</span>
          </div>
          <div>
            <span className="text-[9px] text-soc-textMuted uppercase font-bold block">Last Verified</span>
            <span className="text-[11px] font-bold text-soc-textSecondary truncate block mt-0.5">{auditIntegrity.lastVerified}</span>
          </div>
        </div>

        {/* Tamper Warning Banner if Invalid */}
        {!isValid && auditIntegrity.brokenEntryId && (
          <div className="p-3 rounded-lg bg-red-100 dark:bg-red-950/40 border border-red-300 dark:border-red-800 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-red-800 dark:text-red-300">
              <AlertOctagon className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
              <span>
                <strong>Hash break detected on Entry {auditIntegrity.brokenEntryId}.</strong> Expected vs observed hash mismatch flagged.
              </span>
            </div>

            {onViewEntry && (
              <button
                onClick={() => onViewEntry(auditIntegrity.brokenEntryId!)}
                className="px-2.5 py-1 rounded bg-red-600 hover:bg-red-700 border border-red-600 text-white font-bold text-[10px] shrink-0 cursor-pointer"
              >
                Inspect Entry
              </button>
            )}
          </div>
        )}

        {/* Action Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-soc-border">
          <span className="text-[10px] text-soc-textMuted font-sans">
            <strong>Real verification:</strong> walks the actual SHA-256 hash chain and checks the Ed25519 signature on every ledger entry via <code>POST /api/ledger/verify</code>. Tamper test simulates corruption without touching the real chain.
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsVerifyOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/80 hover:bg-emerald-200 dark:hover:bg-emerald-900 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-bold text-xs shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>[ VERIFY CHAIN ]</span>
            </button>

            <button
              onClick={() => setIsTamperOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-950/80 hover:bg-red-200 dark:hover:bg-red-900 border border-red-300 dark:border-red-800 text-red-800 dark:text-red-300 font-bold text-xs hover:shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>[ RUN TAMPER TEST ]</span>
            </button>
          </div>
        </div>
      </div>

      <VerifyChainModal isOpen={isVerifyOpen} onClose={() => setIsVerifyOpen(false)} />
      <TamperTestModal isOpen={isTamperOpen} onClose={() => setIsTamperOpen(false)} onViewEntry={onViewEntry} />
    </>
  );
};
