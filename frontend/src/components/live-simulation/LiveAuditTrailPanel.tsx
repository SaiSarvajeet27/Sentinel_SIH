import React, { useState } from 'react';
import {
  Lock,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { LiveAuditTrailEntry } from '../../types/liveSimulation';
import clsx from 'clsx';

interface Props {
  auditTrail: LiveAuditTrailEntry[];
}

export const LiveAuditTrailPanel: React.FC<Props> = ({ auditTrail }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="bg-soc-card border border-soc-border rounded-xl p-4 shadow-sm space-y-3.5">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-soc-border pb-2.5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-500">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold text-soc-textPrimary">
                Live Immutable Audit Trail & Hash Chain
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                SHA-256 Chained
              </span>
            </div>
            <div className="text-[10px] text-soc-textSecondary font-medium mt-0.5">
              Hash-chained audit ledger — Simulated with WebCrypto SHA-256
            </div>
          </div>
        </div>

        <div className="text-right">
          <span className="text-xs font-mono font-bold text-soc-textPrimary">
            {auditTrail.length} Records
          </span>
        </div>
      </div>

      {/* Audit Stream Table / Timeline */}
      {auditTrail.length === 0 ? (
        <div className="p-6 text-center text-xs text-soc-textMuted bg-soc-secondaryCard rounded-lg border border-soc-border">
          Audit ledger ready. Entries will stream live as workflow stages progress.
        </div>
      ) : (
        <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
          {auditTrail.map((entry) => {
            const isExpanded = expandedId === entry.id;

            return (
              <div
                key={entry.id}
                className="p-2.5 rounded-lg bg-soc-secondaryCard border border-soc-border hover:border-soc-borderLight transition-all space-y-1.5 text-xs"
              >
                <div
                  onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  className="flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] font-bold text-soc-accent">
                      #{entry.sequenceNumber.toString().padStart(2, '0')}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-soc-card border border-soc-border text-soc-textPrimary">
                      {entry.eventType}
                    </span>
                    <span className="text-[10px] font-mono text-soc-textMuted">
                      {new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: false })}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={clsx(
                        'px-1.5 py-0.2 rounded text-[9px] font-bold border',
                        entry.status === 'SUCCESS' || entry.status === 'COMPLETED' || entry.status === 'APPROVED'
                          ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                          : entry.status === 'MATCH'
                          ? 'bg-orange-500/10 text-orange-500 border-orange-500/30'
                          : entry.status === 'REJECTED'
                          ? 'bg-red-500/10 text-red-500 border-red-500/30'
                          : 'bg-soc-card text-soc-textMuted border-soc-border'
                      )}
                    >
                      {entry.status}
                    </span>
                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-soc-textMuted" /> : <ChevronRight className="w-3.5 h-3.5 text-soc-textMuted" />}
                  </div>
                </div>

                <p className="text-[11px] text-soc-textSecondary leading-snug pl-6">
                  {entry.details}
                </p>

                {/* Cryptographic Hash Summary Pill */}
                <div className="pl-6 pt-1 flex items-center justify-between text-[9px] font-mono text-soc-textMuted border-t border-soc-border/40">
                  <span className="truncate max-w-[280px]">
                    Hash: <strong className="text-soc-cyan">{entry.hash.slice(0, 20)}…</strong>
                  </span>
                  <span>Actor: <strong className="text-soc-textPrimary">{entry.actor}</strong></span>
                </div>

                {/* Expanded Cryptographic Provenance Details */}
                {isExpanded && (
                  <div className="mt-2 p-2 rounded bg-soc-card border border-soc-border text-[10px] font-mono space-y-1 ml-6 animate-fadeIn">
                    <div className="text-soc-textMuted">
                      Record ID: <span className="text-soc-textPrimary">{entry.id}</span>
                    </div>
                    <div className="text-soc-textMuted">
                      Source Pipeline: <span className="text-soc-textPrimary">{entry.source}</span>
                    </div>
                    <div className="text-soc-textMuted truncate">
                      Parent SHA-256: <span className="text-amber-500">{entry.parentHash}</span>
                    </div>
                    <div className="text-soc-textMuted truncate">
                      Current SHA-256: <span className="text-emerald-500">{entry.hash}</span>
                    </div>
                    {entry.evidenceRef && (
                      <div className="text-soc-textMuted">
                        Evidence Linked: <span className="text-soc-accent">{entry.evidenceRef}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
