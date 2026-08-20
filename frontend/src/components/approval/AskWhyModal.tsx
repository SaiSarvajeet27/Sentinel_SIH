import React from 'react';
import { X, HelpCircle, Cpu, ShieldAlert, FileText } from 'lucide-react';
import { ApprovalRequest } from '../../types/soc';
import { TierBadge } from '../common/TierBadge';
import { BothSidesDecisionPanel } from '../ai/BothSidesDecisionPanel';
import { EvidenceReference } from '../common/EvidenceReference';
import { useSOC } from '../common/SOCContext';

interface Props {
  isOpen: boolean;
  request: ApprovalRequest | null;
  onClose: () => void;
}

export const AskWhyModal: React.FC<Props> = ({ isOpen, request, onClose }) => {
  const { aiAnalyses } = useSOC();
  if (!isOpen || !request) return null;

  const linkedEvidenceIds = Array.from(
    new Set(
      (aiAnalyses[request.incidentId]?.claims || []).flatMap((c) => c.evidenceIds).filter(Boolean)
    )
  ).slice(0, 5);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-soc-card border border-soc-border rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl animate-fade-in font-sans">
        {/* Modal Header */}
        <div className="p-5 bg-gradient-to-r from-soc-card via-soc-card to-soc-ai/10 border-b border-soc-border flex items-center justify-between sticky top-0 z-10 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/60 border border-purple-300 dark:border-purple-700 text-purple-800 dark:text-purple-300">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-soc-textPrimary tracking-wide">
                AI Recommendation Rationale — Ask Why
              </h2>
              <p className="text-xs text-soc-textMuted">Request ID: {request.id} | Incident: {request.incidentId}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-soc-textMuted hover:text-soc-textPrimary hover:bg-soc-cardHover transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 text-xs">
          {/* Target Action Banner */}
          <div className="p-4 rounded-xl bg-soc-secondaryCard border border-soc-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-soc-accent uppercase tracking-wider">Recommended Action</span>
              <TierBadge tier={request.tier || 'TIER_2'} size="sm" />
            </div>
            <h3 className="text-sm font-bold text-soc-textPrimary font-mono">{request.actionTitle}</h3>
            <p className="text-soc-textSecondary font-sans">{request.reason}</p>
          </div>

          {/* AI Metrics & Linked Evidence Badges */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
            <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/80">
              <div className="text-soc-textMuted text-[10px] uppercase font-bold flex items-center justify-center gap-1">
                <Cpu className="w-3.5 h-3.5 text-soc-ai" />
                AI Confidence
              </div>
              <div className="text-xl font-extrabold text-soc-ai mt-1">{request.aiConfidence}%</div>
            </div>

            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80">
              <div className="text-soc-textMuted text-[10px] uppercase font-bold flex items-center justify-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                Risk Score
              </div>
              <div className="text-xl font-extrabold text-amber-600 dark:text-amber-400 mt-1">{request.riskScore} / 100</div>
            </div>

            <div className="p-3 rounded-xl bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800/80">
              <div className="text-soc-textMuted text-[10px] uppercase font-bold flex items-center justify-center gap-1">
                <FileText className="w-3.5 h-3.5 text-soc-cyan" />
                Linked Evidence
              </div>
              <div className="flex items-center justify-center gap-1.5 mt-2 flex-wrap">
                {linkedEvidenceIds.length > 0 ? (
                  linkedEvidenceIds.map((id) => <EvidenceReference key={id} eventId={id} size="sm" />)
                ) : (
                  <span className="text-soc-textMuted text-[10px]">No linked evidence loaded yet</span>
                )}
              </div>
            </div>
          </div>

          {/* Both-Sides Decision Panel Integration */}
          <BothSidesDecisionPanel incidentId={request.incidentId} />
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-soc-secondaryCard border-t border-soc-border flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-soc-card hover:bg-soc-cardHover border border-soc-border text-soc-textPrimary font-bold font-mono transition-colors cursor-pointer"
          >
            CLOSE EXPLANATION
          </button>
        </div>
      </div>
    </div>
  );
};

