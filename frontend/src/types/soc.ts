export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export type IncidentStatus = 'OPEN' | 'INVESTIGATING' | 'CONTAINED' | 'RESOLVED' | 'CLOSED';

export type EventSource = 'EMAIL' | 'IDENTITY' | 'ENDPOINT' | 'NETWORK';

// Phase 1 Core Governance Types
export type AutonomyMode = 'ALWAYS_ASK' | 'RECOMMEND_ONLY' | 'ACT_AND_NOTIFY' | 'FULL_AUTO_DISABLED';

export type AuthorizationTier = 'TIER_0' | 'TIER_1' | 'TIER_2' | 'TIER_3';

export type Reversibility = 'YES' | 'LIMITED' | 'NO';

export type HumanDecision = 'APPROVE' | 'OVERRIDE' | 'ASK_WHY' | 'ALTERNATIVES' | 'ESCALATE';

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ESCALATED' | 'PARTIALLY_APPROVED' | 'REVERTED';

export type RollbackStatus = 'AVAILABLE' | 'EXECUTED' | 'REVERTED' | 'NOT_AVAILABLE';

export interface AuthUser {
  email: string;
  name: string;
  role: string;
  avatarInitials: string;
}

export interface ActionAlternative {
  id: string;
  title: string;
  description: string;
  tier: AuthorizationTier;
  riskLevel: ActionRiskLevel;
  reversibility: Reversibility;
  tradeOff: string;
}

export interface Incident {
  id: string; // e.g. "INC-1042"
  title: string;
  description: string;
  severity: Severity;
  status: IncidentStatus;
  riskScore: number; // 0 - 100
  affectedUser: string;
  affectedUserEmail: string;
  affectedDevice: string;
  affectedIp: string;
  attackVector: string;
  detectedAt: string;
  updatedAt: string;
  tags: string[];
  eventIds: string[];
  nodeIds: string[];
  aiConfidence: number;
  requiresHumanApproval: boolean;
}

export interface SecurityEvent {
  id: string; // e.g. "EVT-801"
  timestamp: string;
  source: EventSource;
  eventType: string;
  severity: Severity;
  description: string;
  user: string;
  device: string;
  ip: string;
  details: Record<string, string | number | boolean>;
  rawPayload?: string;
  incidentId?: string;
}

export interface AttackNodeData extends Record<string, unknown> {
  label: string;
  stage: string;
  severity: Severity;
  timestamp: string;
  eventId: string;
  device: string;
  user: string;
  description: string;
  details: string;
  status: 'active' | 'contained' | 'investigating';
  iconType: 'email' | 'link' | 'lock' | 'user' | 'shield' | 'terminal' | 'file' | 'skull';
}

export interface AttackNodeItem {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: AttackNodeData;
}

export interface AttackEdgeItem {
  id: string;
  source: string;
  target: string;
  animated?: boolean;
  label?: string;
  style?: Record<string, string | number>;
}

export interface Evidence {
  id: string;
  incidentId: string;
  eventId: string;
  timestamp: string;
  type: string;
  source: EventSource;
  name: string;
  value: string;
  hash?: string;
  confidence: number;
  description: string;
}

export interface IndicatorCheck {
  id: string;
  label: string;
  matched: boolean;
  weight: 'HIGH' | 'MEDIUM' | 'LOW';
  details: string;
}

// Phase 2 AI Decision Intelligence & Transparency Types
export interface HistoricalPrecedent {
  totalSimilar: number;
  isolatedCount: number;
  alternativeCount: number;
  successRate: string;
}

export interface DecisionSupport {
  whyAct: string[];
  whyWait: string[];
  riskIfIgnored: string;
  alternatives: ActionAlternative[];
  historicalPrecedent: HistoricalPrecedent;
}

export interface AIClaim {
  id: string;
  claimText: string;
  confidence: number;
  evidenceIds: string[];
  status: 'VERIFIED' | 'REMOVED';
}

export interface DataSourceSummary {
  emailCount: number;
  endpointCount: number;
  identityCount: number;
  networkCount: number;
  totalCount: number;
}

export interface KnownLimitation {
  id: string;
  title: string;
  description: string;
  impact: string;
  category: string;
}

export interface RemovedClaim {
  id: string;
  claimText: string;
  removalReason: string;
  status: string;
}

export interface AITransparency {
  totalGenerated: number;
  verifiedCount: number;
  removedCount: number;
  removedClaims: RemovedClaim[];
}

export interface AIAnalysis {
  incidentId: string;
  threatName: string;
  confidence: number; // e.g. 94
  summary: string;
  explanation: string[];
  indicators: IndicatorCheck[];
  rootCause: string;
  riskAssessment: string;
  recommendedPlaybook: string;

  // Phase 2 Decision Intelligence & Transparency Fields
  decisionSupport?: DecisionSupport;
  claims?: AIClaim[];
  dataSources?: DataSourceSummary;
  knownLimitations?: KnownLimitation[];
  aiTransparency?: AITransparency;
}

export type ActionRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type ActionStatus = 'PENDING' | 'PRE_APPROVED' | 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'FAILED' | 'REVERTED' | 'ESCALATED';

export interface ResponseAction {
  id: string;
  incidentId: string;
  title: string;
  description: string;
  riskLevel: ActionRiskLevel;
  tier?: AuthorizationTier;
  reversibility?: Reversibility;
  affectedScope?: string;
  requiresApproval: boolean;
  status: ActionStatus;
  executedAt?: string;
  executedBy?: string;
  revertedAt?: string;
  revertedBy?: string;
}

export interface ApprovalRequest {
  id: string;
  incidentId: string;
  actionId: string;
  actionTitle: string;
  severity: Severity;
  riskScore: number;
  reason: string;
  aiConfidence: number;
  supportingEventsCount: number;
  status: ApprovalStatus;
  requestedAt: string;
  decidedAt?: string;
  decidedBy?: string;
  rejectionReason?: string;
  
  // Phase 1 Governance metadata
  tier?: AuthorizationTier;
  reversibility?: Reversibility;
  affectedScope?: string;
  requiredAuthorization?: string;
  
  // Two-Approver Tracking for Tier 3
  approver1?: { analystName: string; approvedAt: string };
  approver2?: { analystName: string; approvedAt: string };
  
  // Human Override metadata
  overrideDetails?: {
    originalActionTitle: string;
    selectedActionTitle: string;
    overrideReason: string;
    analystName: string;
    timestamp: string;
  };
  
  // Escalation metadata
  escalationDetails?: {
    escalatedTo: string;
    escalationReason: string;
    analystName: string;
    timestamp: string;
  };

  // Rollback Status
  rollbackStatus?: RollbackStatus;
}

export interface AISafetyEvent {
  id: string;
  timestamp: string;
  type: 'PROMPT_INJECTION' | 'POISONED_ALERT' | 'CONFLICTING_DATA';
  title: string;
  source: string;
  payload: string;
  reasoning: string;
  status: 'BLOCKED' | 'FLAGGED_FOR_HUMAN' | 'NEUTRALIZED';
  mitigation: string;
  confidenceScore: number;
}

export interface AnalystFeedback {
  id: string;
  incidentId: string;
  incidentTitle: string;
  decision: 'CONFIRM' | 'FALSE_POSITIVE' | 'MODIFY';
  originalSeverity: Severity;
  newSeverity?: Severity;
  reason?: string;
  analystId: string;
  createdAt: string;
}

export interface DashboardMetrics {
  totalEvents: number;
  activeIncidents: number;
  criticalThreats: number;
  highThreats: number;
  mediumThreats: number;
  pendingApprovals: number;
  aiInvestigationsCount: number;
  systemStatus: 'OPERATIONAL' | 'DEGRADED' | 'ATTACK_IN_PROGRESS';
  threatTrend: { time: string; events: number; incidents: number }[];
  severityDistribution: { severity: Severity; count: number; percentage: number }[];
}

// Phase 3 AI Trust, Rules & Learning Loop, and Audit Integrity Types
export interface TrustHistoryPeriod {
  period: string; // e.g. "T-6", "T-5", etc.
  score: number;  // e.g. 86
}

export interface TopAcceptedType {
  category: string; // e.g. "Phishing containment"
  rate: number;     // e.g. 94
}

export interface TrustMetrics {
  accepted: number;
  rejected: number;
  overridden: number;
  total: number;
  trustScore: number; // e.g. 86
  history: TrustHistoryPeriod[];
  topAcceptedTypes: TopAcceptedType[];
}

export type RuleStatus = 'HEALTHY' | 'WATCH' | 'NOISY' | 'RETIREMENT_CANDIDATE' | 'RETIRED';

export interface DetectionRule {
  id: string;
  name: string;
  falsePositiveRate: number; // e.g. 31.2
  alertVolume: number;        // e.g. 246
  status: RuleStatus;
  lastUpdated: string;
  overrideCount: number;
  category: string;
  reasonForReview?: string;
}

export interface RuleOverrideItem {
  id: string;
  ruleId: string;
  ruleName: string;
  aiAction: string;
  humanAction: string;
  reason: string;
  analyst: string;
  timestamp: string;
}

export type AuditIntegrityStatus = 'VALID' | 'INVALID';

export interface AuditIntegrityState {
  status: AuditIntegrityStatus;
  entriesChecked: number;
  algorithm: string;
  signature: string;
  lastVerified: string;
  brokenEntryId?: string;
  expectedHash?: string;
  observedHash?: string;
}

// Phase 4 Scenario Simulator Types
export type AttackMode = 'SINGLE' | 'CONCURRENT' | 'PARTIAL' | 'CLEAN_BASELINE';
export type NoiseLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type ReplaySpeed = 0.5 | 1 | 2 | 4 | 8;
export type SimulationStatus = 'IDLE' | 'RUNNING' | 'PAUSED' | 'COMPLETED';

export interface ScenarioPreset {
  id: string;
  name: string;
  description: string;
  defaultAttackMode: AttackMode;
  totalEvents: number;
  stages: string[];
}

export interface SimulationEventItem {
  id: string;
  timestamp: string;
  source: EventSource;
  type: string;
  severity: Severity;
  stage: string;
  description: string;
  isSimulated: boolean;
  isAdversarial?: boolean;
}

export interface SimulationSnapshot {
  id: string;
  timestamp: string;
  scenarioName: string;
  attackMode: AttackMode;
  activeIncidents: number;
  eventCount: number;
  noiseLevel: NoiseLevel;
  replaySpeed: ReplaySpeed;
  aiEnabled: boolean;
}

export interface SimulationState {
  status: SimulationStatus;
  scenarioId: string;
  scenarioName: string;
  attackMode: AttackMode;
  noiseLevel: NoiseLevel;
  replaySpeed: ReplaySpeed;
  adversarialMode: boolean;
  elapsedTimeSeconds: number;
  eventCount: number;
  activeStage: string;
  activeVectors?: string[];
}

