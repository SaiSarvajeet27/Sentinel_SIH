export type PipelineStageId =
  | 'EVENT_GENERATED'
  | 'EVENT_PROCESSED'
  | 'SIGMA_DETECTED'
  | 'AI_EVALUATED'
  | 'INCIDENT_CREATED'
  | 'RESPONSE_RECOMMENDED'
  | 'HUMAN_APPROVAL'
  | 'RESPONSE_EXECUTED'
  | 'AUDIT_RECORDED';

export type StageStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'WAITING_FOR_APPROVAL'
  | 'REJECTED'
  | 'OVERRIDDEN'
  | 'ESCALATED'
  | 'FAILED';

export interface PipelineStageConfig {
  id: PipelineStageId;
  order: number;
  label: string;
  shortDesc: string;
  status: StageStatus;
  timestamp?: string;
  details?: string;
}

export interface LiveTelemetryEvent {
  id: string; // EVT-LIVE-001
  timestamp: string;
  source: 'Email Gateway' | 'Identity Provider (Entra ID)' | 'EDR (Sentinel Endpoint)' | 'Network Sensor';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  eventType: string;
  user: string;
  host: string;
  ip: string;
  summary: string;
  rawPayload: Record<string, unknown>;
  normalizedFields: Record<string, string | number | boolean>;
  correlationTags: string[];
}

export interface LiveSigmaDetection {
  ruleId: string; // SOC-AUTH-001
  ruleTitle: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  matchStatus: 'MATCH' | 'NO_MATCH' | 'SUPPRESSED';
  matchedEventId: string;
  category: string;
  mitreTactic: string;
  mitreTechnique: string;
  mitreId: string; // T1566.002 / T1078
  detectionLogic: string;
  timestamp: string;
  isSimulated: true;
}

export interface LiveAIEvaluation {
  assessment: string;
  confidenceScore: number; // 92
  threatCategory: string;
  rootCause: string;
  whyAct: string[];
  whyWait: string[];
  riskIfIgnored: string;
  evidenceReferences: { label: string; refId: string; significance: string }[];
  isSimulated: true;
}

export interface LiveIncidentData {
  id: string; // INC-LIVE-001
  title: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'OPEN' | 'INVESTIGATING' | 'CONTAINED' | 'REJECTED' | 'ESCALATED';
  riskScore: number; // 88 / 100
  affectedUser: string;
  affectedHost: string;
  attackVector: string;
  createdTimestamp: string;
  updatedTimestamp?: string;
}

export interface LiveAlternativeAction {
  id: string;
  title: string;
  description: string;
  tier: 'Tier 1' | 'Tier 2' | 'Tier 3';
  risk: 'Low' | 'Medium' | 'High';
  tradeoff: string;
}

export interface LiveResponseRecommendation {
  playbookName: string;
  actionTitle: string;
  targetScope: string;
  governanceTier: 'Tier 1 (Automated)' | 'Tier 2 (Sensitive - Reversible)' | 'Tier 3 (High Blast Radius)';
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reversibility: 'YES' | 'LIMITED' | 'NO';
  justification: string;
  alternatives: LiveAlternativeAction[];
  executionStatus: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'OVERRIDDEN' | 'ESCALATED' | 'EXECUTING' | 'EXECUTED';
}

export type ApprovalDecisionType = 'APPROVE' | 'REJECT' | 'OVERRIDE' | 'ESCALATE';

export interface LiveApprovalDecision {
  decision: ApprovalDecisionType;
  actor: string;
  timestamp: string;
  reason?: string;
  selectedActionTitle?: string;
  escalateToRole?: string;
}

export interface LiveAuditTrailEntry {
  id: string; // AUD-LIVE-001
  sequenceNumber: number;
  timestamp: string;
  eventType:
    | 'EVENT_GENERATED'
    | 'EVENT_PROCESSED'
    | 'SIGMA_DETECTION'
    | 'AI_EVALUATION'
    | 'INCIDENT_CREATED'
    | 'RESPONSE_RECOMMENDED'
    | 'APPROVAL_REQUESTED'
    | 'ANALYST_APPROVED'
    | 'ANALYST_REJECTED'
    | 'ANALYST_OVERRIDDEN'
    | 'ANALYST_ESCALATED'
    | 'RESPONSE_EXECUTED'
    | 'AUDIT_COMPLETED';
  actor: string;
  source: string;
  status: 'SUCCESS' | 'MATCH' | 'COMPLETED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'OVERRIDDEN' | 'ESCALATED' | 'HALTED';
  incidentId?: string;
  evidenceRef?: string;
  details: string;
  hash: string;
  parentHash: string;
}

export type SimulationRunStatus = 'IDLE' | 'RUNNING' | 'PAUSED' | 'WAITING_FOR_APPROVAL' | 'COMPLETED' | 'HALTED';

export interface LiveSimulationState {
  status: SimulationRunStatus;
  currentStage: PipelineStageId;
  stages: PipelineStageConfig[];
  speed: 0.5 | 1 | 2 | 4;
  elapsedSeconds: number;
  
  // Pipeline Data Units
  event: LiveTelemetryEvent | null;
  processedTelemetry: {
    normalized: boolean;
    correlatedSources: string[];
    riskIndicatorsFound: number;
  } | null;
  sigmaDetection: LiveSigmaDetection | null;
  aiEvaluation: LiveAIEvaluation | null;
  incident: LiveIncidentData | null;
  recommendation: LiveResponseRecommendation | null;
  approvalDecision: LiveApprovalDecision | null;
  executionResult: {
    success: boolean;
    executedAction: string;
    target: string;
    timestamp: string;
    verifiedStatus: string;
  } | null;
  auditTrail: LiveAuditTrailEntry[];
}
