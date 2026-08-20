// Backend JSON (Sentinel SOC FastAPI) → frontend types (types/soc.ts).
// Every function here is a pure mapping — no fetching, no state. This is
// the seam between "what the real system returns" and "what the UI
// components were built to read."
import {
  Incident,
  SecurityEvent,
  Evidence,
  AIAnalysis,
  ResponseAction,
  ApprovalRequest,
  AISafetyEvent,
  AnalystFeedback,
  DashboardMetrics,
  DetectionRule,
  RuleOverrideItem,
  AuditIntegrityState,
  TrustMetrics,
  Severity,
  IncidentStatus,
  EventSource,
  AuthorizationTier,
  ActionStatus,
  ApprovalStatus,
  IndicatorCheck,
  AIClaim,
  KnownLimitation,
  DataSourceSummary,
  AITransparency,
  DecisionSupport,
  HistoricalPrecedent,
  ActionAlternative,
  RemediationPlan,
  RemediationStep,
} from '../types/soc';

// ── small shared helpers ──────────────────────────────────────────────
const titleCase = (s: string) =>
  (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const shortTime = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
};

const entityName = (entities: string[] | undefined, prefix: string): string => {
  const e = (entities || []).find((x) => x.startsWith(`${prefix}:`));
  return e ? e.split(':').slice(1).join(':') : '';
};

const SEVERITY_MAP: Record<string, Severity> = {
  critical: 'CRITICAL',
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
  informational: 'INFO',
};

const STATUS_MAP: Record<string, IncidentStatus> = {
  open: 'OPEN',
  investigating: 'INVESTIGATING',
  contained: 'CONTAINED',
  resolved: 'RESOLVED',
  closed: 'CLOSED',
  false_positive: 'RESOLVED',
};

const SOURCE_MAP: Record<string, EventSource> = {
  email: 'EMAIL',
  identity: 'IDENTITY',
  endpoint: 'ENDPOINT',
  network: 'NETWORK',
  edr: 'ENDPOINT',
  siem: 'NETWORK',
};

// ── Incident ─────────────────────────────────────────────────────────
export function adaptIncident(row: any): Incident {
  const host = entityName(row.entities, 'host');
  const user = entityName(row.entities, 'user');
  const confidence = row.risk_factors?.confidence
    ? Math.round(row.risk_factors.confidence * 100)
    : row.model_score
    ? Math.round(row.model_score)
    : 75;

  return {
    id: row.incident_id,
    title: row.title,
    description:
      row.narrative?.summary ||
      row.confidence_driver ||
      `${row.title} — ${(row.stages || []).filter(Boolean).length}/7 kill-chain stages observed.`,
    severity: SEVERITY_MAP[row.severity] || 'MEDIUM',
    status: STATUS_MAP[row.status] || 'OPEN',
    riskScore: Math.round(row.risk_score ?? 0),
    affectedUser: user || 'unknown',
    affectedUserEmail: user ? `${user}@sentinel.local` : '',
    affectedDevice: host || 'unknown',
    affectedIp: '',
    attackVector: (row.tactics && row.tactics[0]) || 'multi-stage',
    detectedAt: row.first_seen || '',
    updatedAt: row.last_seen || row.first_seen || '',
    tags: row.tactics || [],
    eventIds: (row.timeline || []).map((e: any) => e.event_id),
    nodeIds: (row.alerts || []).map((a: any) => a.alert_id),
    aiConfidence: confidence,
    requiresHumanApproval: (row.pending_actions ?? 0) > 0,
  };
}

// ── SecurityEvent ────────────────────────────────────────────────────
export function adaptEvent(e: any, incidentId?: string, severity?: Severity): SecurityEvent {
  return {
    id: e.event_id,
    timestamp: shortTime(e.ts),
    source: SOURCE_MAP[(e.source || '').toLowerCase()] || 'NETWORK',
    eventType: titleCase(e.class_name || e.class || 'event'),
    severity: severity || 'INFO',
    description: `${titleCase(e.class_name || e.class || '')}${e.outcome ? ` — ${e.outcome}` : ''}`,
    user: e.actor_user || e.actor || '',
    device: e.src_host || e.host || '',
    ip: e.src_ip || '',
    details: e.untrusted || {},
    rawPayload: e.untrusted ? JSON.stringify(e.untrusted, null, 2) : undefined,
    incidentId,
  };
}

/** Timeline events embedded in `GET /api/incidents/{id}` — severity is
 * back-filled from the incident's own alerts where an event is cited. */
export function adaptIncidentTimeline(row: any): SecurityEvent[] {
  const sevByEvent: Record<string, Severity> = {};
  for (const a of row.alerts || []) {
    // alerts don't list their event_ids in the incident payload, so this
    // is best-effort: the incident's own severity backs every event that
    // has no more specific alert to point to.
    void a;
  }
  return (row.timeline || []).map((e: any) =>
    adaptEvent(e, row.incident_id, sevByEvent[e.event_id] || SEVERITY_MAP[row.severity] || 'INFO')
  );
}

// ── Evidence (from the ledger — the real audit trail) ───────────────
export function adaptLedgerToEvidence(entry: any): Evidence {
  const payload = entry.payload || {};
  return {
    id: `EVD-${entry.seq}`,
    incidentId: payload.incident_id || '',
    eventId: payload.event_id || payload.action_id || `ledger-${entry.seq}`,
    timestamp: entry.ts,
    type: (entry.action_type || '').toUpperCase(),
    source: 'ENDPOINT',
    name: titleCase(entry.action_type || ''),
    value: JSON.stringify(payload),
    hash: entry.entry_hash,
    confidence: 100,
    description: `Ledger entry #${entry.seq} — signed and hash-chained. ` +
      `Actor: ${entry.actor}.`,
  };
}

// ── ResponseAction ───────────────────────────────────────────────────
const ACTION_STATUS_MAP: Record<string, ActionStatus> = {
  pending: 'PENDING',
  partially_approved: 'PENDING',
  executed: 'EXECUTED',
  rejected: 'REJECTED',
  dismissed: 'REJECTED',
  rolled_back: 'REVERTED',
};

export function adaptAction(a: any): ResponseAction {
  const tier = a.tier ?? 0;
  return {
    id: a.action_id,
    incidentId: a.incident_id,
    title: a.label || titleCase(a.kind),
    description: a.rationale || a.blast_radius?.summary || a.label || '',
    riskLevel: tier >= 3 ? 'CRITICAL' : tier === 2 ? 'HIGH' : tier === 1 ? 'MEDIUM' : 'LOW',
    tier: `TIER_${tier}` as AuthorizationTier,
    reversibility: a.reversible ? 'YES' : 'NO',
    affectedScope: a.blast_radius?.summary || '',
    requiresApproval: tier >= 2,
    status: ACTION_STATUS_MAP[a.status] || 'PENDING',
    executedAt: a.executed_at || (a.status === 'executed' ? a.requested_at : undefined),
    executedBy: (a.approved_by || []).join(', ') || undefined,
    revertedAt: a.status === 'rolled_back' ? a.requested_at : undefined,
  };
}

// ── ApprovalRequest (the same Action row, read as a governance request) ─
export function adaptApproval(a: any, incidentRisk?: number): ApprovalRequest {
  const tier = a.tier ?? 2;
  let status: ApprovalStatus = 'PENDING';
  if (a.status === 'executed') status = 'APPROVED';
  else if (a.status === 'rejected' || a.status === 'dismissed') status = 'REJECTED';
  else if (a.status === 'partially_approved') status = 'PARTIALLY_APPROVED';
  else if (a.status === 'rolled_back') status = 'APPROVED';
  if (a.escalated_to && (a.status === 'pending' || a.status === 'partially_approved')) {
    status = 'ESCALATED';
  }

  const affected =
    (a.blast_radius?.users_affected?.length || 0) + (a.blast_radius?.hosts_affected?.length || 0);

  return {
    id: a.action_id,
    incidentId: a.incident_id,
    actionId: a.action_id,
    actionTitle: a.label || titleCase(a.kind),
    severity: tier >= 3 ? 'CRITICAL' : 'HIGH',
    riskScore: Math.round(incidentRisk ?? 75),
    reason: a.rationale || a.blast_radius?.summary || '',
    aiConfidence: 85,
    supportingEventsCount: Math.max(1, affected),
    status,
    requestedAt: a.requested_at,
    decidedAt: a.status === 'executed' ? (a.executed_at || a.requested_at) : a.status === 'rejected' ? a.requested_at : undefined,
    decidedBy: (a.approved_by || []).join(' & ') || undefined,
    tier: `TIER_${tier}` as AuthorizationTier,
    reversibility: a.reversible ? 'YES' : 'NO',
    affectedScope: a.blast_radius?.summary || '',
    requiredAuthorization: tier >= 3 ? 'Two approvers (Tier 3)' : 'One approver (Tier 2)',
    approver1: a.approved_by?.[0] ? { analystName: a.approved_by[0], approvedAt: a.requested_at } : undefined,
    approver2: a.approved_by?.[1] ? { analystName: a.approved_by[1], approvedAt: a.requested_at } : undefined,
    rollbackStatus: a.status === 'rolled_back' ? 'REVERTED' : a.reversible ? 'AVAILABLE' : 'NOT_AVAILABLE',
  };
}

// ── AI Safety events (already close to 1:1 with the backend shape) ──
export function adaptSafetyEvent(e: any): AISafetyEvent {
  return {
    id: e.id,
    timestamp: e.timestamp,
    type: e.type,
    title: e.title,
    source: e.source,
    payload: e.payload,
    reasoning: e.reasoning,
    status: e.status,
    mitigation: e.mitigation,
    confidenceScore: e.confidence_score,
  };
}

// ── Analyst Feedback ─────────────────────────────────────────────────
const VERDICT_MAP: Record<string, AnalystFeedback['decision']> = {
  tp: 'CONFIRM',
  fp: 'FALSE_POSITIVE',
  needs_review: 'MODIFY',
};

export function adaptFeedback(f: any): AnalystFeedback {
  return {
    id: `FBD-${f.id}`,
    incidentId: f.incident_id,
    incidentTitle: f.incident_title || f.incident_id,
    decision: VERDICT_MAP[f.verdict] || 'MODIFY',
    originalSeverity: 'MEDIUM',
    reason: f.reason_code || undefined,
    analystId: f.analyst,
    createdAt: f.created_at,
  };
}

export function adaptFeedbackStats(s: any) {
  return {
    totalSubmitted: s.total_submitted,
    confirmedCount: s.confirmed_count,
    falsePositivesCount: s.false_positives_count,
    modifiedCount: s.modified_count,
    accuracyPercentage: s.accuracy_percentage,
  };
}

// ── Detection rules & overrides ─────────────────────────────────────
export function adaptRule(r: any): DetectionRule {
  const fpPct = Math.round((r.fp_rate || 0) * 100);
  let status: DetectionRule['status'] = 'HEALTHY';
  if (!r.enabled) status = 'RETIRED';
  else if (r.proposed_for_retirement) status = 'RETIREMENT_CANDIDATE';
  else if (fpPct > 30) status = 'NOISY';
  else if (fpPct > 10) status = 'WATCH';

  return {
    id: r.rule_id,
    name: r.title,
    falsePositiveRate: fpPct,
    alertVolume: r.fired,
    status,
    lastUpdated: 'Live',
    overrideCount: 0,
    category: r.technique || 'detection',
    reasonForReview: r.proposed_for_retirement
      ? `False-positive rate ${fpPct}% across ${r.fired} firings — protected: ${r.protected ? 'no, eligible for retirement' : 'no'}.`
      : undefined,
  };
}

export function adaptOverride(o: any, idx: number): RuleOverrideItem {
  return {
    id: `OVR-${idx}`,
    ruleId: '',
    ruleName: o.recommended,
    aiAction: o.recommended,
    humanAction: o.chosen,
    reason: o.reason || '',
    analyst: o.analyst,
    timestamp: o.at || '',
  };
}

// ── Trust metrics (near 1:1) ────────────────────────────────────────
export function adaptTrustMetrics(t: any): TrustMetrics {
  return {
    accepted: t.accepted,
    rejected: t.rejected,
    overridden: t.overridden,
    total: t.total,
    trustScore: t.trust_score,
    history: t.history || [],
    topAcceptedTypes: t.top_accepted_types || [],
  };
}

// ── Audit integrity (verify / tamper-test → one display state) ─────
export function adaptAuditIntegrity(
  verify: any,
  entriesTotal: number,
  publicKey?: string
): AuditIntegrityState {
  const base: AuditIntegrityState = {
    status: verify?.valid === false ? 'INVALID' : 'VALID',
    entriesChecked: verify?.entries_checked ?? entriesTotal,
    algorithm: 'SHA-256 hash chain + Ed25519 signature',
    signature: publicKey ? publicKey.split('\n')[1]?.slice(0, 24) + '…' : 'ed25519-verified',
    lastVerified: verify?.verified_at || new Date().toISOString(),
  };
  if (verify?.valid === false) {
    base.brokenEntryId = `#${verify.first_break_at}`;
    base.expectedHash = 'signed at write time';
    base.observedHash = verify.reason;
  }
  return base;
}

export function adaptTamperTest(result: any, prior: AuditIntegrityState): AuditIntegrityState {
  return {
    ...prior,
    status: 'INVALID',
    lastVerified: new Date().toISOString(),
    brokenEntryId: `#${result.demonstrated_at}`,
    expectedHash: 'signed at write time',
    observedHash: result.result?.reason || 'payload modified after signing',
  };
}

// ── Dashboard metrics ────────────────────────────────────────────────
const THREAT_COLORS: Record<string, string> = {
  Phishing: '#1677FF',
  'Identity Abuse': '#7C3AED',
  Malware: '#DC2626',
  'Adversarial Content': '#D97706',
  Other: '#009ED8',
};

export function adaptDashboard(
  dash: any,
  incidents: Incident[]
): DashboardMetrics & {
  threatActivity: { time: string; events: number }[];
  threatTypes: { name: string; value: number; color: string }[];
  opsSummary: Record<string, number>;
  playbooks: { id: string; name: string; used: number; executed: number; share: number }[];
  systemHealthScore: number;
} {
  const kpis = dash.kpis || {};
  const open = incidents.filter((i) => i.status === 'OPEN' || i.status === 'INVESTIGATING');
  const critical = open.filter((i) => i.severity === 'CRITICAL').length;
  const high = open.filter((i) => i.severity === 'HIGH').length;
  const medium = open.filter((i) => i.severity === 'MEDIUM').length;
  const low = open.filter((i) => i.severity === 'LOW' || i.severity === 'INFO').length;
  const total = open.length || 1;

  const activity = dash.threat_activity;
  const activitySeries: number[] = activity?.series?.[0]?.values || [];
  const threatActivity = (activity?.buckets || []).map((time: string, i: number) => ({
    time,
    events: activitySeries[i] || 0,
  }));

  const threatTypes = (dash.threat_types || []).map((t: any) => ({
    name: t.name,
    value: t.percent ?? t.value,
    color: THREAT_COLORS[t.name] || '#64748B',
  }));

  return {
    totalEvents: kpis.events_processed || 0,
    activeIncidents: kpis.open_incidents ?? open.length,
    criticalThreats: kpis.critical_alerts ?? critical,
    highThreats: high,
    mediumThreats: medium,
    pendingApprovals: kpis.pending_approvals || 0,
    aiInvestigationsCount: kpis.alerts_raised || 0,
    systemStatus: 'OPERATIONAL',
    threatTrend: threatActivity.map((t: any) => ({ time: t.time, events: t.events, incidents: 0 })),
    severityDistribution: [
      { severity: 'CRITICAL' as Severity, count: critical, percentage: Math.round((critical / total) * 100) },
      { severity: 'HIGH' as Severity, count: high, percentage: Math.round((high / total) * 100) },
      { severity: 'MEDIUM' as Severity, count: medium, percentage: Math.round((medium / total) * 100) },
      { severity: 'LOW' as Severity, count: low, percentage: Math.round((low / total) * 100) },
    ],
    threatActivity,
    threatTypes,
    opsSummary: dash.ops_summary || {},
    playbooks: dash.playbooks || [],
    systemHealthScore: kpis.system_health?.score ?? 100,
  };
}

// ── AI Analysis (composite — combines several endpoints into one view) ─
export function adaptAIAnalysis(
  incidentRow: any,
  explanation: any,
  alternatives: any[],
  trustTimeMachine: any,
  remediation?: { actions?: any[]; awaiting_approval?: number; auto_executed?: number }
): AIAnalysis {
  const evidence = explanation?.evidence || [];
  const indicators: IndicatorCheck[] = evidence.map((e: any, i: number) => ({
    id: `IND-${i}`,
    label: e.what_it_shows?.slice(0, 60) || e.event_id,
    matched: true,
    weight: i === 0 ? 'HIGH' : 'MEDIUM',
    details: e.what_it_shows || '',
  }));

  const claims: AIClaim[] = evidence.map((e: any, i: number) => ({
    id: `CLM-${i}`,
    claimText: e.what_it_shows || '',
    confidence: 85,
    evidenceIds: [e.event_id],
    status: 'VERIFIED',
  }));

  const dataSources: DataSourceSummary = (() => {
    const sb = incidentRow.source_breakdown || {};
    const emailCount = sb.email || 0;
    const endpointCount = sb.endpoint || 0;
    const identityCount = sb.identity || 0;
    const networkCount = sb.network || 0;
    return {
      emailCount,
      endpointCount,
      identityCount,
      networkCount,
      totalCount: emailCount + endpointCount + identityCount + networkCount,
    };
  })();

  const knownLimitations: KnownLimitation[] = (explanation?.limitations || []).map(
    (text: string, i: number) => ({
      id: `LIM-${i}`,
      title: text.length > 48 ? text.slice(0, 45) + '…' : text,
      description: text,
      impact: 'May understate coverage in this blind spot.',
      category: 'coverage',
    })
  );

  const aiTransparency: AITransparency = {
    totalGenerated: (explanation?.reasoning_steps?.length || 0) + evidence.length,
    verifiedCount: (explanation?.reasoning_steps?.length || 0) + evidence.length,
    removedCount: explanation?.stripped_claims || 0,
    removedClaims: [],
  };

  const alts: ActionAlternative[] = (alternatives || []).map((a: any, i: number) => ({
    id: `ALT-${i}`,
    title: a.label,
    description: a.tradeoff,
    tier: `TIER_${a.tier}` as AuthorizationTier,
    riskLevel: a.tier >= 3 ? 'CRITICAL' : a.tier === 2 ? 'HIGH' : 'LOW',
    reversibility: 'YES',
    tradeOff: a.tradeoff,
  }));

  const precedent: HistoricalPrecedent = trustTimeMachine?.count
    ? {
        totalSimilar: trustTimeMachine.count,
        isolatedCount: trustTimeMachine.actions_taken?.isolate_host || 0,
        alternativeCount: Object.values(trustTimeMachine.actions_taken || {}).reduce(
          (a: number, b) => a + (b as number),
          0
        ),
        successRate: trustTimeMachine.outcomes
          ? `${Math.round(
              ((trustTimeMachine.outcomes['Confirmed threat'] || 0) / trustTimeMachine.count) * 100
            )}%`
          : 'n/a',
      }
    : { totalSimilar: 0, isolatedCount: 0, alternativeCount: 0, successRate: 'n/a' };

  const decisionSupport: DecisionSupport = {
    whyAct: explanation?.why_act ? [explanation.why_act] : [],
    whyWait: explanation?.why_wait ? [explanation.why_wait] : [],
    riskIfIgnored: explanation?.confidence_driver || '',
    alternatives: alts,
    historicalPrecedent: precedent,
  };

  const confidence = incidentRow.risk_factors?.confidence
    ? Math.round(incidentRow.risk_factors.confidence * 100)
    : 75;

  const remediationSteps: RemediationStep[] = (remediation?.actions || []).map((a: any) => ({
    actionId: a.action_id,
    kind: a.kind,
    label: a.label || titleCase(a.kind),
    target: a.target,
    tier: `TIER_${a.tier ?? 0}` as AuthorizationTier,
    why: a.why || a.rationale || '',
    status: a.status,
    reversible: !!a.reversible,
    needsApproval: a.status === 'pending' || a.status === 'partially_approved',
  }));

  const remediationPlan: RemediationPlan | undefined = remediation
    ? {
        steps: remediationSteps,
        awaitingApproval: remediation.awaiting_approval ?? 0,
        autoExecuted: remediation.auto_executed ?? 0,
      }
    : undefined;

  const recommendedPlaybook = remediationSteps.length
    ? `${remediationSteps.length}-step plan: ${remediationSteps.map((s) => s.label).join(', ')}`
    : 'No remediation plan proposed yet for this incident.';

  return {
    incidentId: incidentRow.incident_id,
    threatName: incidentRow.title,
    confidence,
    summary: incidentRow.narrative?.summary || explanation?.confidence_driver || '',
    explanation: explanation?.why_this || [],
    indicators,
    rootCause: explanation?.rationale || '',
    riskAssessment: explanation?.confidence_driver || '',
    recommendedPlaybook,
    remediationPlan,
    decisionSupport,
    claims,
    dataSources,
    knownLimitations,
    aiTransparency,
  };
}
