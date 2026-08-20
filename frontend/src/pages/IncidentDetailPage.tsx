import React, { useState } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import {
  FileText,
  GitMerge,
  Cpu,
  History,
  Zap,
  Clock,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { SeverityBadge } from '../components/common/SeverityBadge';
import { StatusBadge } from '../components/common/StatusBadge';
import { RiskScore } from '../components/common/RiskScore';
import { AttackGraph } from '../components/attack-graph/AttackGraph';
import { useSOC } from '../components/common/SOCContext';
import { IncidentStatus, EventSource } from '../types/soc';
import { DemoStep } from '../services/realtimeService';
import { BothSidesDecisionPanel } from '../components/ai/BothSidesDecisionPanel';
import { DataSourceAttributionCard } from '../components/ai/DataSourceAttributionCard';
import { KnownLimitationsCard } from '../components/ai/KnownLimitationsCard';
import { RemovedClaimsModal } from '../components/ai/RemovedClaimsModal';
import { EvidenceReference } from '../components/common/EvidenceReference';
import { AIStatusBadge } from '../components/common/AIStatusBadge';

export const IncidentDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const context = useOutletContext<{ currentStep: DemoStep }>();
  const currentStep = context?.currentStep;
  const { incidents, events, evidence, aiAnalyses, setActiveIncidentId, aiEnabled, getAIClaims, setIncidentStatus } = useSOC();

  const targetId = id || incidents[0]?.id || '';
  const incident = incidents.find((i) => i.id === targetId) || incidents[0];

  const [activeTab, setActiveTab] = useState<'overview' | 'graph' | 'ai' | 'evidence' | 'response' | 'timeline'>('overview');
  const [sourceFilter, setSourceFilter] = useState<EventSource | 'ALL'>('ALL');

  const displayStatus = incident.status;
  const aiAnalysis = aiAnalyses[incident.id];
  const claims = getAIClaims(incident.id);

  const rawEvents = events.filter((e) => e.incidentId === targetId);
  const filteredEvents = sourceFilter === 'ALL' ? rawEvents : rawEvents.filter((e) => e.source === sourceFilter);
  const relatedEvidence = evidence.filter((e) => e.incidentId === targetId);

  const handleSelectTab = (tabId: 'overview' | 'graph' | 'ai' | 'evidence' | 'response' | 'timeline') => {
    setActiveTab(tabId);
    setActiveIncidentId(incident.id);
  };

  const tabs = [
    { id: 'overview', label: 'Overview & Decision Support', icon: FileText },
    { id: 'graph', label: 'Attack Chain Graph', icon: GitMerge },
    { id: 'ai', label: 'AI Investigation', icon: Cpu },
    { id: 'evidence', label: 'Evidence Payload', icon: History, count: relatedEvidence.length },
    { id: 'response', label: 'Response Strategy', icon: Zap },
    { id: 'timeline', label: 'Telemetry Timeline', icon: Clock, count: filteredEvents.length },
  ];

  return (
    <div className="space-y-5 font-sans transition-colors">
      {/* Top Back & Action Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 font-mono text-xs">
        <button
          onClick={() => navigate('/incidents')}
          className="flex items-center gap-1.5 text-soc-textSecondary hover:text-soc-textPrimary transition-colors font-sans"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Incidents List</span>
        </button>

        <div className="flex items-center gap-3">
          <AIStatusBadge size="sm" />

          <div className="flex items-center gap-2 border-l border-soc-border pl-3">
            <span className="text-soc-textSecondary text-[11px] font-sans">Set Status:</span>
            {(['INVESTIGATING', 'CONTAINED', 'RESOLVED'] as IncidentStatus[]).map((st) => (
              <button
                key={st}
                onClick={() => setIncidentStatus(incident.id, st)}
                disabled={displayStatus === st}
                className={`px-2.5 py-1 rounded-lg text-xs font-sans font-semibold transition-all ${
                  displayStatus === st
                    ? 'bg-soc-accent text-white shadow-sm cursor-default'
                    : 'bg-soc-secondaryCard border border-soc-border text-soc-textSecondary hover:text-soc-textPrimary cursor-pointer'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Incident Header Hub */}
      <div className="p-5 rounded-xl bg-soc-card border border-soc-border space-y-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-soc-border pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold font-mono text-soc-accent">{incident.id}</span>
              <SeverityBadge severity={incident.severity} size="sm" />
              <StatusBadge status={displayStatus} size="sm" />
            </div>
            <h1 className="text-xl font-bold text-soc-textPrimary tracking-tight">{incident.title}</h1>
          </div>

          <div className="flex items-center gap-4 bg-soc-secondaryCard p-2.5 rounded-lg border border-soc-border">
            <RiskScore score={incident.riskScore} size="md" />
            <div className="text-right border-l border-soc-border pl-3 text-xs">
              <div className="text-soc-textSecondary text-[10px] uppercase font-bold">AI Confidence</div>
              <div className="text-base font-extrabold text-soc-ai">
                {aiEnabled ? `${aiAnalysis.confidence}%` : 'N/A (DISABLED)'}
              </div>
            </div>
          </div>
        </div>

        {/* Metadata Details */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 text-xs">
          <div className="p-2.5 rounded-lg bg-soc-secondaryCard border border-soc-border">
            <div className="text-soc-textMuted text-[9px] font-bold uppercase">AFFECTED USER</div>
            <div className="text-soc-textPrimary font-bold truncate mt-0.5">{incident.affectedUser} ({incident.affectedUserEmail})</div>
          </div>

          <div className="p-2.5 rounded-lg bg-soc-secondaryCard border border-soc-border">
            <div className="text-soc-textMuted text-[9px] font-bold uppercase">AFFECTED HOST & IP</div>
            <div className="text-soc-textPrimary font-bold truncate mt-0.5">{incident.affectedDevice} ({incident.affectedIp})</div>
          </div>

          <div className="p-2.5 rounded-lg bg-soc-secondaryCard border border-soc-border">
            <div className="text-soc-textMuted text-[9px] font-bold uppercase">ATTACK VECTOR</div>
            <div className="text-soc-accent font-bold truncate mt-0.5">{incident.attackVector}</div>
          </div>

          <div className="p-2.5 rounded-lg bg-soc-secondaryCard border border-soc-border flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <div className="min-w-0">
              <div className="text-soc-textMuted text-[9px] font-bold uppercase">GOVERNANCE REQUIREMENT</div>
              <div className="text-amber-600 dark:text-amber-400 font-bold truncate text-[11px] mt-0.5">{incident.requiresHumanApproval ? 'HUMAN APPROVAL REQUIRED' : 'PRE-APPROVED'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex border-b border-soc-border gap-1 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleSelectTab(tab.id as any)}
            className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-soc-accent text-soc-accent bg-soc-accent/10 font-bold'
                : 'border-transparent text-soc-textSecondary hover:text-soc-textPrimary hover:bg-soc-cardHover'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span className="px-1.5 py-0.5 rounded bg-soc-secondaryCard border border-soc-border text-soc-textSecondary text-[9px]">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content Display */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          {/* Data Source Attribution Section */}
          <DataSourceAttributionCard
            incidentId={incident.id}
            onSelectSourceFilter={(src) => {
              setSourceFilter(src);
              if (src !== 'ALL') handleSelectTab('timeline');
            }}
            activeSourceFilter={sourceFilter}
          />

          {/* AI Claims with Evidence Reference Badges */}
          <div className="p-4 rounded-xl bg-soc-card border border-soc-border space-y-3 text-xs shadow-sm">
            <div className="flex items-center justify-between border-b border-soc-border pb-2.5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-soc-ai" />
                <h3 className="font-bold text-soc-textPrimary uppercase tracking-wider text-xs">Evidence-Linked AI Claims</h3>
              </div>
              <RemovedClaimsModal incidentId={incident.id} size="sm" />
            </div>

            {aiEnabled ? (
              <div className="space-y-2">
                {claims.map((clm) => (
                  <div key={clm.id} className="p-3 rounded-lg bg-soc-secondaryCard border border-soc-border flex items-start justify-between gap-3">
                    <div className="space-y-0.5">
                      <p className="text-soc-textPrimary font-sans text-xs">{clm.claimText}</p>
                      <div className="flex items-center gap-2 text-[10px] text-soc-ai font-mono">
                        <span>Confidence: {clm.confidence}%</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {clm.evidenceIds.map((evId) => (
                        <EvidenceReference key={evId} eventId={evId} size="sm" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-soc-secondaryCard border border-soc-border text-center text-amber-500 font-bold">
                AI Assistance Disabled — Evidence claims unavailable. Raw telemetry remain visible below.
              </div>
            )}
          </div>

          {/* Both-Sides AI Decision Intelligence Panel */}
          <BothSidesDecisionPanel incidentId={incident.id} onSelectAlternative={() => navigate('/approvals')} />

          {/* Known Limitations Warning Card */}
          <KnownLimitationsCard incidentId={incident.id} />
        </div>
      )}

      {activeTab === 'graph' && (
        <div className="space-y-3">
          <h3 className="font-bold text-soc-textPrimary uppercase text-xs">Interactive Multi-Stage Attack Graph</h3>
          <AttackGraph unlockedCount={currentStep ? currentStep.unlockedNodesCount : undefined} />
        </div>
      )}

      {activeTab === 'ai' && (
        <div className="p-5 rounded-xl bg-soc-card border border-soc-border space-y-4 text-xs shadow-sm">
          <div className="flex items-center justify-between border-b border-soc-border pb-3">
            <h3 className="text-sm font-bold text-soc-textPrimary uppercase tracking-wider flex items-center gap-2">
              <Cpu className="w-4 h-4 text-soc-ai" />
              AI Reasoning Engine Assessment ({incident.id})
            </h3>
            <AIStatusBadge size="sm" />
          </div>

          {aiEnabled ? (
            <>
              <p className="text-soc-textSecondary font-sans leading-relaxed p-3.5 rounded-lg bg-soc-secondaryCard border border-soc-border text-xs">
                {aiAnalysis.summary}
              </p>

              <div className="space-y-2">
                <h4 className="font-bold text-soc-textSecondary uppercase text-[10px]">Key Indicator Checklist</h4>
                {aiAnalysis.indicators.map((ind) => (
                  <div key={ind.id} className="p-2.5 rounded-lg bg-soc-secondaryCard border border-soc-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span className="text-soc-textPrimary font-bold">{ind.label}</span>
                    </div>
                    <span className="text-soc-textSecondary text-[11px] font-sans">{ind.details}</span>
                  </div>
                ))}
              </div>

              <BothSidesDecisionPanel incidentId={incident.id} />
            </>
          ) : (
            <div className="p-6 rounded-lg bg-soc-secondaryCard border border-soc-border text-center space-y-2">
              <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto" />
              <h4 className="text-base font-bold text-soc-textPrimary uppercase">AI ASSISTANCE DISABLED</h4>
              <p className="text-soc-textSecondary font-sans max-w-md mx-auto text-xs">
                AI reasoning and explanation generators are currently disabled. Incident telemetry, risk scores, tier governance, and human approval queues remain fully functional.
              </p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'evidence' && (
        <div className="p-5 rounded-xl bg-soc-card border border-soc-border space-y-3 text-xs shadow-sm">
          <h3 className="text-sm font-bold text-soc-textPrimary uppercase tracking-wider">Forensic Evidence Artifacts</h3>
          <div className="space-y-2.5">
            {relatedEvidence.map((evd) => (
              <div key={evd.id} className="p-3 rounded-lg bg-soc-secondaryCard border border-soc-border space-y-1">
                <div className="flex justify-between font-bold text-soc-accent text-[11px]">
                  <span>{evd.id} • {evd.type}</span>
                  {evd.eventId && <EvidenceReference eventId={evd.eventId} size="sm" />}
                </div>
                <div className="text-soc-textPrimary font-bold">{evd.name}</div>
                <div className="text-soc-textSecondary break-all text-[11px] font-mono">{evd.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'response' && (
        <div className="p-5 rounded-xl bg-soc-card border border-soc-border space-y-4 text-xs shadow-sm">
          <h3 className="text-sm font-bold text-soc-textPrimary uppercase tracking-wider">AI Recommended Response Playbook</h3>
          <div className="p-3.5 rounded-lg bg-purple-500/15 border border-soc-ai/40 text-soc-ai font-bold">
            {aiAnalysis.recommendedPlaybook}
          </div>
          <button
            onClick={() => navigate('/approvals')}
            className="px-4 py-2 rounded-lg bg-soc-accent text-white font-bold text-xs shadow-sm flex items-center gap-1.5"
          >
            <span>Review in Approvals Queue</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {activeTab === 'timeline' && (
        <div className="p-5 rounded-xl bg-soc-card border border-soc-border space-y-4 text-xs shadow-sm">
          <div className="flex items-center justify-between border-b border-soc-border pb-3">
            <h3 className="text-sm font-bold text-soc-textPrimary uppercase tracking-wider">Security Telemetry Timeline</h3>
            <div className="flex items-center gap-1.5">
              <span className="text-soc-textSecondary text-[10px]">Filter Source:</span>
              {(['ALL', 'EMAIL', 'ENDPOINT', 'IDENTITY', 'NETWORK'] as (EventSource | 'ALL')[]).map((src) => (
                <button
                  key={src}
                  onClick={() => setSourceFilter(src)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    sourceFilter === src
                      ? 'bg-soc-accent text-white'
                      : 'bg-soc-secondaryCard border border-soc-border text-soc-textSecondary hover:text-soc-textPrimary'
                  }`}
                >
                  {src}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5">
            {filteredEvents.map((evt) => (
              <div key={evt.id} className="p-3 rounded-lg bg-soc-secondaryCard border border-soc-border flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-soc-accent font-bold text-[11px] font-mono">
                    <span>{evt.timestamp}</span>
                    <SeverityBadge severity={evt.severity} size="sm" />
                    <span>{evt.source}</span>
                  </div>
                  <div className="text-soc-textPrimary font-bold text-xs mt-1">{evt.eventType}</div>
                  <p className="text-soc-textSecondary font-sans text-xs mt-0.5">{evt.description}</p>
                </div>

                <EvidenceReference eventId={evt.id} size="sm" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
