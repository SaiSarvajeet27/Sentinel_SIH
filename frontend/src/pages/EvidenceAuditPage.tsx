import React, { useState } from 'react';
import { FileCode, ChevronDown, ChevronUp, Lock, ShieldCheck, CheckCircle2, Info } from 'lucide-react';
import { useSOC } from '../components/common/SOCContext';
import { SeverityBadge } from '../components/common/SeverityBadge';
import { EvidenceReference } from '../components/common/EvidenceReference';
import { AuditIntegrityCard } from '../components/audit/AuditIntegrityCard';

export const EvidenceAuditPage: React.FC = () => {
  const { events, evidence, activeIncident, auditIntegrity } = useSOC();
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string>('ALL');

  const isChainValid = auditIntegrity.status === 'VALID';
  const mainInc = activeIncident || { id: 'No Active Incident' };
  const sources = ['ALL', 'EMAIL', 'IDENTITY', 'ENDPOINT', 'NETWORK'];

  const filteredEvents = events.filter(
    (e) => sourceFilter === 'ALL' || e.source === sourceFilter
  );

  return (
    <div className="space-y-5 font-sans">
      {/* Header Banner */}
      <div className="p-4 rounded-xl bg-soc-card border border-soc-border flex flex-wrap items-center justify-between gap-4 shadow-soc-card">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 mb-0.5">
            <ShieldCheck className="w-4 h-4" />
            <span>CRYPTOGRAPHIC EVIDENCE & AUDIT REGISTRY</span>
          </div>
          <h1 className="text-lg font-extrabold text-soc-textPrimary tracking-tight">
            Immutable Audit Trail & Cryptographic Verification
          </h1>
          <p className="text-[11px] text-soc-textMuted mt-0.5">
            Tamper-evident SHA-256 hash chains for all AI decisions, human approvals & containment actions
          </p>
        </div>

        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border font-bold text-xs shadow-sm ${
          isChainValid
            ? 'bg-emerald-100 dark:bg-emerald-950/80 border-emerald-300 dark:border-emerald-600/80 text-emerald-800 dark:text-emerald-400 dark:shadow-glow-cyan'
            : 'bg-red-100 dark:bg-red-950/80 border-red-300 dark:border-red-700 text-red-800 dark:text-red-400 animate-pulse'
        }`}>
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>{isChainValid ? 'CHAIN VERIFIED VALID' : 'CHAIN INTEGRITY VIOLATION'}</span>
        </div>
      </div>

      {/* Verification Overview Triad */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="p-4 rounded-xl bg-soc-card border border-soc-border space-y-1.5 shadow-soc-card">
          <div className="text-soc-textMuted text-[10px] uppercase font-bold">Total Audit Entries</div>
          <div className="text-2xl font-black text-soc-textPrimary">{evidence.length} Records</div>
          <p className="text-soc-textMuted font-sans text-[11px]">Logged chronologically with full parent SHA hash links</p>
        </div>

        <div className={`p-4 rounded-xl bg-soc-card border space-y-1.5 shadow-soc-card ${isChainValid ? 'border-emerald-300 dark:border-emerald-800/80' : 'border-red-300 dark:border-red-800/80'}`}>
          <div className="text-soc-textMuted text-[10px] uppercase font-bold">Cryptographic Integrity</div>
          <div className={`text-xl font-black flex items-center gap-1.5 ${isChainValid ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
            <Lock className="w-4 h-4" />
            <span>{isChainValid ? '100% Intact' : 'Break Detected'}</span>
          </div>
          <p className="text-soc-textMuted font-sans text-[11px]">
            {isChainValid ? 'Zero broken links or hash mismatch alerts detected' : `Hash mismatch flagged at entry ${auditIntegrity.brokenEntryId || '?'}`}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-soc-card border border-soc-border space-y-1.5 shadow-soc-card">
          <div className="text-soc-textMuted text-[10px] uppercase font-bold">Latest Entry Hash</div>
          <div className="text-[11px] font-bold text-soc-cyan font-mono truncate">{evidence[0]?.hash || '—'}</div>
          <p className="text-soc-textMuted font-sans text-[11px]">Immutable leaf node block signature</p>
        </div>
      </div>

      {/* PHASE 3 DEDICATED AUDIT INTEGRITY CARD */}
      <AuditIntegrityCard onViewEntry={(id) => setExpandedEventId(id)} />

      {/* Provenance Flow Card */}
      <div className="p-4 rounded-xl bg-soc-card border border-soc-border space-y-3 text-xs shadow-soc-card">
        <h3 className="text-xs font-bold text-soc-textMuted uppercase tracking-widest flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-soc-ai" />
          EVIDENCE PROVENANCE CHAIN — {mainInc.id}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {evidence.slice(0, 3).map((evd) => (
            <div key={evd.id} className="p-3.5 rounded-lg bg-soc-secondaryCard border border-soc-border space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold text-soc-cyan font-mono">{evd.id}</span>
                {evd.eventId && <EvidenceReference eventId={evd.eventId} size="sm" />}
              </div>
              <div className="text-soc-textPrimary font-bold text-xs truncate">{evd.name}</div>
              <p className="text-soc-textMuted font-sans text-[11px] line-clamp-2">{evd.description}</p>
              <div className="pt-1.5 border-t border-soc-border text-[10px] text-soc-textMuted flex items-center justify-between">
                <span>Hash: <strong className="text-soc-textSecondary font-mono">{evd.hash?.slice(0, 16) || 'sha256-...'}</strong></span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">Verified</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Source Filter Strip */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-soc-textMuted font-bold text-[11px]">Filter Telemetry Source:</span>
        {sources.map((src) => (
          <button
            key={src}
            onClick={() => setSourceFilter(src)}
            className={`px-2.5 py-1 rounded-md border font-bold transition-colors text-xs cursor-pointer ${
              sourceFilter === src
                ? 'bg-soc-accent text-white border-soc-accent shadow-sm'
                : 'bg-soc-card border-soc-border text-soc-textMuted hover:text-soc-textPrimary'
            }`}
          >
            {src} ({events.filter((e) => src === 'ALL' || e.source === src).length})
          </button>
        ))}
      </div>

      {/* Forensic Timeline Events */}
      <div className="space-y-3">
        {filteredEvents.map((evt) => {
          const isExpanded = expandedEventId === evt.id;
          const relatedEvd = evidence.find((e) => e.eventId === evt.id);

          return (
            <div
              key={evt.id}
              className="rounded-xl bg-soc-card border border-soc-border overflow-hidden transition-all shadow-soc-card"
            >
              <div
                onClick={() => setExpandedEventId(isExpanded ? null : evt.id)}
                className="p-3.5 flex items-center justify-between gap-4 cursor-pointer hover:bg-soc-cardHover transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono font-bold text-soc-cyan w-24">{evt.timestamp}</span>
                  <SeverityBadge severity={evt.severity} size="sm" />
                  <span className="px-2 py-0.5 rounded bg-soc-secondaryCard border border-soc-border text-[10px] font-mono text-soc-textSecondary font-bold">
                    {evt.source}
                  </span>
                  <h3 className="text-xs font-bold text-soc-textPrimary">{evt.eventType}</h3>
                </div>

                <div className="flex items-center gap-3">
                  {!isChainValid && evt.id === auditIntegrity.brokenEntryId ? (
                    <span className="px-2 py-0.5 rounded bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-400 border border-red-300 dark:border-red-800 text-[10px] font-bold animate-pulse">
                      🔴 INVALID
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800 text-[10px] font-bold">
                      🟢 VERIFIED
                    </span>
                  )}
                  <EvidenceReference eventId={evt.id} size="sm" />
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-soc-textMuted" /> : <ChevronDown className="w-4 h-4 text-soc-textMuted" />}
                </div>
              </div>

              {/* Collapsible Forensic Detail */}
              {isExpanded && (
                <div className="p-4 border-t border-soc-border bg-soc-secondaryCard space-y-3 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-lg bg-soc-card border border-soc-border text-soc-textSecondary">
                    <div><span className="text-soc-textMuted">User:</span> <strong className="text-soc-textPrimary">{evt.user}</strong></div>
                    <div><span className="text-soc-textMuted">Device:</span> <strong className="text-soc-textPrimary">{evt.device}</strong></div>
                    <div><span className="text-soc-textMuted">IP Origin:</span> <strong className="text-soc-cyan font-mono">{evt.ip}</strong></div>
                  </div>

                  {/* Why this evidence matters */}
                  <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60 text-purple-900 dark:text-purple-200">
                    <div className="flex items-center gap-1.5 font-bold mb-1 text-[11px]">
                      <Info className="w-3.5 h-3.5 text-soc-ai" />
                      <span>WHY THIS EVIDENCE MATTERS</span>
                    </div>
                    <p className="text-[11px] font-sans text-soc-textSecondary leading-relaxed">
                      {relatedEvd ? relatedEvd.description : 'Provides telemetry verification supporting autonomous AI incident risk classification and human governance review.'}
                    </p>
                  </div>

                  {evt.rawPayload && (
                    <div>
                      <span className="text-[10px] text-soc-textMuted font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                        <FileCode className="w-3.5 h-3.5 text-soc-accent" />
                        Raw Log Payload Artifact:
                      </span>
                      <pre className="soc-code-block p-3 rounded-lg overflow-x-auto text-[11px] leading-relaxed">
                        {evt.rawPayload}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

