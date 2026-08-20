import React, { useState, useEffect, useRef } from 'react';
import { X, ShieldCheck, Loader2, CheckCircle2 } from 'lucide-react';
import { useSOC } from '../common/SOCContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const VerifyChainModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { auditIntegrity, verifyAuditChain } = useSOC();
  const [isVerifying, setIsVerifying] = useState(true);
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      if (!hasRunRef.current) {
        hasRunRef.current = true;
        setIsVerifying(true);
        // No artificial delay — this is a real network call
        // (POST /api/ledger/verify), so the spinner shows for exactly as
        // long as the actual verification takes.
        verifyAuditChain().finally(() => setIsVerifying(false));
      }
    } else {
      hasRunRef.current = false;
    }
  }, [isOpen, verifyAuditChain]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200 font-sans text-xs">
      <div className="w-full max-w-md bg-soc-card border border-emerald-800/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="p-5 bg-gradient-to-r from-soc-card via-soc-card to-emerald-500/10 border-b border-soc-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-900/60 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 shadow-sm dark:shadow-glow-emerald">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-soc-textPrimary tracking-wider uppercase">
                Audit Chain Verification
              </h2>
              <p className="text-soc-textMuted text-[11px] font-sans">
                Cryptographic Log Hash Integrity Check
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-soc-secondaryCard hover:bg-soc-cardHover border border-soc-border text-soc-textMuted hover:text-soc-textPrimary transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 text-center font-mono">
          {isVerifying ? (
            <div className="py-8 space-y-4">
              <Loader2 className="w-10 h-10 text-emerald-500 animate-spin mx-auto" />
              <div className="text-soc-textPrimary font-bold text-sm tracking-wider uppercase">
                VERIFYING AUDIT CHAIN...
              </div>
              <p className="text-soc-textMuted text-xs font-sans">
                Checking SHA-256 block hashes and Ed25519 signatures across {auditIntegrity.entriesChecked.toLocaleString()} entries...
              </p>
            </div>
          ) : auditIntegrity.status === 'VALID' ? (
            <div className="py-4 space-y-5 animate-in zoom-in-95 duration-200">
              <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-950/80 border-2 border-emerald-400 dark:border-emerald-500 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-sm dark:shadow-glow-emerald">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div className="space-y-1">
                <h3 className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                  🟢 AUDIT CHAIN VALID
                </h3>
                <p className="text-soc-textSecondary text-xs font-sans">
                  All audit trail entries verified successfully without hash breaks or key mismatches.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-soc-secondaryCard border border-soc-border space-y-2 text-left text-[11px]">
                <div className="flex justify-between text-soc-textSecondary">
                  <span className="text-soc-textMuted font-bold">Entries Checked:</span>
                  <span className="font-bold text-soc-textPrimary">{auditIntegrity.entriesChecked.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-soc-textSecondary">
                  <span className="text-soc-textMuted font-bold">Hash Algorithm:</span>
                  <span className="font-bold text-soc-cyan">{auditIntegrity.algorithm}</span>
                </div>
                <div className="flex justify-between text-soc-textSecondary">
                  <span className="text-soc-textMuted font-bold">Digital Signature:</span>
                  <span className="font-bold text-soc-ai">{auditIntegrity.signature}</span>
                </div>
                <div className="flex justify-between text-soc-textSecondary">
                  <span className="text-soc-textMuted font-bold">Last Verified:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">{auditIntegrity.lastVerified}</span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-[10px] text-emerald-800 dark:text-emerald-300 font-sans">
                Real check: walks the SHA-256 hash chain and verifies the Ed25519 signature on every entry, server-side.
              </div>
            </div>
          ) : (
            <div className="py-4 space-y-5 animate-in zoom-in-95 duration-200">
              <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-950/80 border-2 border-red-400 dark:border-red-500 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 rotate-45" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-extrabold text-red-600 dark:text-red-400 uppercase tracking-wider">
                  🔴 CHAIN INTEGRITY VIOLATION
                </h3>
                <p className="text-soc-textSecondary text-xs font-sans">
                  Verification found a break at entry {auditIntegrity.brokenEntryId || '?'}: {auditIntegrity.observedHash}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-soc-secondaryCard border-t border-soc-border flex justify-end">
          <button
            onClick={onClose}
            disabled={isVerifying}
            className="px-4 py-2 rounded-lg bg-emerald-100 dark:bg-emerald-950 hover:bg-emerald-200 dark:hover:bg-emerald-900 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-bold text-xs disabled:opacity-50 transition-colors cursor-pointer"
          >
            [ CLOSE ]
          </button>
        </div>
      </div>
    </div>
  );
};
