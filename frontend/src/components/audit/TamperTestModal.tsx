import React, { useState } from 'react';
import { X, ShieldAlert, Loader2, AlertOctagon, Eye } from 'lucide-react';
import { useSOC } from '../common/SOCContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onViewEntry?: (entryId: string) => void;
}

export const TamperTestModal: React.FC<Props> = ({ isOpen, onClose, onViewEntry }) => {
  const { auditIntegrity, runTamperTest } = useSOC();
  const [step, setStep] = useState<'confirm' | 'running' | 'result'>('confirm');

  if (!isOpen) return null;

  const handleStartTest = () => {
    setStep('running');
    // Real network call (POST /api/ledger/tamper-test) — no artificial delay.
    runTamperTest(true).finally(() => setStep('result'));
  };

  const handleClose = () => {
    setStep('confirm');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200 font-sans text-xs">
      <div className="w-full max-w-lg bg-soc-card border border-red-800/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="p-5 bg-gradient-to-r from-soc-card via-soc-card to-red-500/10 border-b border-soc-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-red-100 dark:bg-red-900/60 border border-red-300 dark:border-red-700 text-red-800 dark:text-red-300 shadow-sm dark:shadow-glow-red">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-soc-textPrimary tracking-wider uppercase">
                DEMO / SIMULATED AUDIT TAMPER TEST
              </h2>
              <p className="text-soc-textMuted text-[11px] font-sans">
                Demonstration of Cryptographic Tamper Detection & Hash Mismatch
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg bg-soc-secondaryCard hover:bg-soc-cardHover border border-soc-border text-soc-textMuted hover:text-soc-textPrimary transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 font-mono">
          {step === 'confirm' && (
            <div className="space-y-5 text-center">
              <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/80 space-y-2">
                <h3 className="text-sm font-bold text-soc-textPrimary uppercase tracking-wider">
                  RUN TAMPER TEST?
                </h3>
                <p className="text-soc-textSecondary font-sans text-xs leading-relaxed">
                  This simulated test injects a demonstration hash mismatch into the audit verification pipeline to test system alert and entry identification logic.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-[11px] font-sans">
                <strong>DEMO / SIMULATED RESULT:</strong> Does not alter actual production log files.
              </div>
            </div>
          )}

          {step === 'running' && (
            <div className="py-8 space-y-4 text-center">
              <Loader2 className="w-10 h-10 text-red-500 animate-spin mx-auto" />
              <div className="text-soc-textPrimary font-bold text-sm tracking-wider uppercase">
                TAMPER TEST — CHECKING AUDIT CHAIN...
              </div>
              <p className="text-soc-textMuted text-xs font-sans">
                Evaluating SHA-256 block sequence integrity across log entries...
              </p>
            </div>
          )}

          {step === 'result' && (
            <div className="space-y-5 animate-in zoom-in-95 duration-200">
              <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 flex items-center gap-3">
                <AlertOctagon className="w-8 h-8 text-red-500 shrink-0" />
                <div>
                  <h3 className="text-base font-extrabold text-red-600 dark:text-red-400 uppercase tracking-wider">
                    🔴 DEMO / SIMULATED RESULT: CHAIN VIOLATION
                  </h3>
                  <p className="text-soc-textSecondary text-xs font-sans">
                    Demonstration Tamper Test: Simulated hash mismatch detected on audit log entry.
                  </p>
                </div>
              </div>

              {/* Broken Entry Details */}
              <div className="p-4 rounded-xl bg-soc-secondaryCard border border-red-200 dark:border-red-900/60 space-y-3">
                <div className="flex items-center justify-between border-b border-soc-border pb-2">
                  <span className="font-bold text-red-600 dark:text-red-400 uppercase text-xs">CHAIN BROKEN AT ENTRY</span>
                  <span className="px-2 py-0.5 rounded bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-300 border border-red-300 dark:border-red-800 font-bold text-[10px]">
                    {auditIntegrity.brokenEntryId || '#47'}
                  </span>
                </div>

                <div className="space-y-2 text-[11px] font-mono">
                  <div>
                    <span className="text-soc-textMuted block font-bold">Expected Previous Hash:</span>
                    <span className="soc-code-block break-all text-[10px] block p-1.5 rounded mt-0.5">
                      {auditIntegrity.expectedHash}
                    </span>
                  </div>

                  <div>
                    <span className="text-soc-textMuted block font-bold">Observed Previous Hash:</span>
                    <span className="bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 break-all text-[10px] block p-1.5 rounded border border-red-200 dark:border-red-900 mt-0.5">
                      {auditIntegrity.observedHash}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-[10px] text-red-800 dark:text-red-300 font-sans text-center font-bold">
                DEMO / SIMULATED RESULT — VERIFICATION PIPELINE FLAGGED ENTRY #47
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-soc-secondaryCard border-t border-soc-border flex items-center justify-between">
          {step === 'confirm' ? (
            <>
              <button
                onClick={handleClose}
                className="px-4 py-2 rounded-lg bg-soc-card hover:bg-soc-cardHover border border-soc-border text-soc-textSecondary font-bold text-xs cursor-pointer"
              >
                [ CANCEL ]
              </button>
              <button
                onClick={handleStartTest}
                className="px-4 py-2 rounded-lg bg-red-100 dark:bg-red-950 hover:bg-red-200 dark:hover:bg-red-900 border border-red-300 dark:border-red-800 text-red-800 dark:text-red-300 font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <ShieldAlert className="w-4 h-4" />
                <span>[ RUN TEST ]</span>
              </button>
            </>
          ) : step === 'running' ? (
            <div className="w-full flex justify-center">
              <span className="text-soc-textMuted font-mono text-xs">Simulating verification...</span>
            </div>
          ) : (
            <div className="w-full flex items-center justify-between gap-3">
              {onViewEntry ? (
                <button
                  onClick={() => {
                    handleClose();
                    onViewEntry(auditIntegrity.brokenEntryId || '');
                  }}
                  className="px-4 py-2 rounded-lg bg-cyan-100 dark:bg-cyan-950 hover:bg-cyan-200 dark:hover:bg-cyan-900 border border-cyan-300 dark:border-cyan-800 text-cyan-800 dark:text-cyan-300 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Eye className="w-4 h-4" />
                  <span>[ VIEW ENTRY #47 ]</span>
                </button>
              ) : <div />}

              <button
                onClick={handleClose}
                className="px-4 py-2 rounded-lg bg-soc-card hover:bg-soc-cardHover border border-soc-border text-soc-textPrimary font-bold text-xs cursor-pointer"
              >
                [ CLOSE ]
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
