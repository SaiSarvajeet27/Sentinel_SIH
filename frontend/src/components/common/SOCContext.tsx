import React, { createContext, useContext, useEffect, useState } from 'react';
import { socStore, SOCNotification } from '../../services/socStore';
import {
  Incident,
  IncidentStatus,
  SecurityEvent,
  AttackNodeItem,
  AttackEdgeItem,
  Evidence,
  AIAnalysis,
  ResponseAction,
  ApprovalRequest,
  AISafetyEvent,
  AnalystFeedback,
  DashboardMetrics,
  AutonomyMode,
  AuthUser,
  DecisionSupport,
  AIClaim,
  DataSourceSummary,
  KnownLimitation,
  AITransparency,
  TrustMetrics,
  DetectionRule,
  RuleOverrideItem,
  AuditIntegrityState,
  AttackMode,
  NoiseLevel,
  ReplaySpeed,
  ScenarioPreset,
  SimulationEventItem,
  SimulationSnapshot,
  SimulationState,
} from '../../types/soc';

interface SOCContextType {
  incidents: Incident[];
  events: SecurityEvent[];
  attackNodes: AttackNodeItem[];
  attackEdges: AttackEdgeItem[];
  evidence: Evidence[];
  aiAnalyses: Record<string, AIAnalysis>;
  responseActions: ResponseAction[];
  approvals: ApprovalRequest[];
  pendingApprovals: ApprovalRequest[];
  safetyEvents: AISafetyEvent[];
  feedbackList: AnalystFeedback[];
  feedbackStats: ReturnType<typeof socStore.getFeedbackStats>;
  activeIncidentId: string;
  activeIncident: Incident | undefined;
  systemStatus: 'OPERATIONAL' | 'DEGRADED' | 'ATTACK_IN_PROGRESS' | 'HUMAN_APPROVAL_REQUIRED' | 'THREAT_CONTAINED';
  metrics: DashboardMetrics;
  notifications: SOCNotification[];
  dashboardExtras: {
    threatActivity: { time: string; events: number }[];
    threatTypes: { name: string; value: number; color: string }[];
    opsSummary: Record<string, number>;
    playbooks: { id: string; name: string; used: number; executed: number; share: number }[];
    systemHealthScore: number;
    healthChecks: Record<string, boolean> | null;
    healthLabel: string;
    risk: {
      worst_score: number | null;
      deterministic: number | null;
      ai_delta: number | null;
      incident_id: string | null;
      open_incidents: number;
    } | null;
    trustScore: number | null;
  };
  setActivityWindow: (window: '24h' | '7d') => void;
  requestCampaignLinks: () => void;
  
  // Phase 1 Governance & Auth State
  authUser: AuthUser | null;
  isAuthenticated: boolean;
  authLoading: boolean;
  autonomyMode: AutonomyMode;
  login: (email: string, pass: string) => Promise<boolean>;
  logout: () => void;
  setAutonomyMode: (mode: AutonomyMode) => void;

  // Phase 2 AI Decision Intelligence & ON/OFF State
  aiEnabled: boolean;
  toggleAI: () => void;
  setAIEnabled: (enabled: boolean) => void;
  getDecisionSupport: (incidentId?: string) => DecisionSupport;
  getAIClaims: (incidentId?: string) => AIClaim[];
  getDataSourceSummary: (incidentId?: string) => DataSourceSummary;
  getKnownLimitations: (incidentId?: string) => KnownLimitation[];
  getAITransparency: (incidentId?: string) => AITransparency;

  // Phase 3 AI Trust, Rules & Audit Integrity State
  trustMetrics: TrustMetrics;
  detectionRules: DetectionRule[];
  ruleOverrides: RuleOverrideItem[];
  auditIntegrity: AuditIntegrityState;
  recordHumanDecisionFeedback: (decision: 'ACCEPTED' | 'REJECTED' | 'OVERRIDDEN') => void;
  retireRule: (ruleId: string) => void;
  keepRule: (ruleId: string) => void;
  verifyAuditChain: () => Promise<AuditIntegrityState>;
  runTamperTest: (simulate?: boolean) => Promise<AuditIntegrityState>;

  // Phase 4 Scenario Simulator State & Controls
  simulationState: SimulationState;
  simulationSnapshots: SimulationSnapshot[];
  simulationEvents: SimulationEventItem[];
  scenarioPresets: ScenarioPreset[];
  setSimulationScenario: (id: string) => void;
  setAttackMode: (mode: AttackMode) => void;
  setNoiseLevel: (level: NoiseLevel) => void;
  setReplaySpeed: (speed: ReplaySpeed) => void;
  toggleAdversarialMode: () => void;
  startSimulation: () => void;
  pauseSimulation: () => void;
  resumeSimulation: () => void;
  resetSimulation: () => void;
  captureSnapshot: () => SimulationSnapshot;
  
  // Actions & Mutators
  setActiveIncidentId: (id: string) => void;
  approveRequest: (requestId: string, analystId: string) => void;
  rejectRequest: (requestId: string, analystId: string, reason: string) => void;
  overrideRequest: (requestId: string, selectedActionTitle: string, overrideReason: string, analystId: string) => void;
  escalateRequest: (requestId: string, escalateTo: string, escalationReason: string, analystId: string) => void;
  rollbackAction: (actionId: string, analystId: string) => void;
  executeResponseAction: (actionId: string) => void;
  submitAnalystFeedback: (feedback: AnalystFeedback) => void;
  setIncidentStatus: (incidentId: string, status: IncidentStatus) => void;
  proposeRemediation: (incidentId: string) => void;
  markNotificationRead: (id: string) => void;
  resetStore: () => void;
}

const SOCContext = createContext<SOCContextType | null>(null);

export const SOCProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [, setTick] = useState(0);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = socStore.subscribe(() => {
      setTick((t) => t + 1);
    });
    socStore.tryRestoreSession().finally(() => setAuthLoading(false));
    return unsubscribe;
  }, []);

  const value: SOCContextType = {
    incidents: socStore.getIncidents(),
    events: socStore.getEvents(),
    attackNodes: socStore.getAttackNodes(),
    attackEdges: socStore.getAttackEdges(),
    evidence: socStore.getEvidence(),
    // A Proxy, not an eagerly-built object: pages read this as
    // `aiAnalyses[someId]`, and building a real dict up front meant calling
    // getAIAnalysis() — which fetches on a cache miss — for every incident
    // in the list on every render (40+ incidents × 4 requests each, purely
    // from having loaded the incidents list). The Proxy defers that fetch
    // to the moment a page actually reads a specific incident's analysis.
    aiAnalyses: new Proxy({} as Record<string, AIAnalysis>, {
      get: (_target, prop: string) => socStore.getAIAnalysis(prop),
    }),
    responseActions: socStore.getResponseActions(),
    approvals: socStore.getApprovals(),
    pendingApprovals: socStore.getPendingApprovals(),
    safetyEvents: socStore.getAISafetyEvents(),
    feedbackList: socStore.getFeedbackList(),
    feedbackStats: socStore.getFeedbackStats(),
    activeIncidentId: socStore.getActiveIncidentId(),
    activeIncident: socStore.getActiveIncident(),
    systemStatus: socStore.getSystemStatus(),
    metrics: socStore.getMetrics(),
    notifications: socStore.getNotifications(),
    dashboardExtras: socStore.getDashboardExtras(),
    setActivityWindow: (w: '24h' | '7d') => { void socStore.setActivityWindow(w); },
    requestCampaignLinks: () => socStore.requestCampaignLinks(),
    
    // Auth & Governance
    authUser: socStore.getAuthUser(),
    isAuthenticated: socStore.getIsAuthenticated(),
    authLoading,
    autonomyMode: socStore.getAutonomyMode(),
    login: (email: string, pass: string) => socStore.login(email, pass),
    logout: () => socStore.logout(),
    setAutonomyMode: (mode: AutonomyMode) => socStore.setAutonomyMode(mode),

    // Phase 2 AI Decision Intelligence
    aiEnabled: socStore.getAIEnabled(),
    toggleAI: () => socStore.toggleAI(),
    setAIEnabled: (enabled: boolean) => socStore.setAIEnabled(enabled),
    getDecisionSupport: (id?: string) => socStore.getDecisionSupport(id),
    getAIClaims: (id?: string) => socStore.getAIClaims(id),
    getDataSourceSummary: (id?: string) => socStore.getDataSourceSummary(id),
    getKnownLimitations: (id?: string) => socStore.getKnownLimitations(id),
    getAITransparency: (id?: string) => socStore.getAITransparency(id),

    // Phase 3 AI Trust, Rules & Audit Integrity
    trustMetrics: socStore.getTrustMetrics(),
    detectionRules: socStore.getDetectionRules(),
    ruleOverrides: socStore.getRuleOverrides(),
    auditIntegrity: socStore.getAuditIntegrity(),
    recordHumanDecisionFeedback: (decision) => socStore.recordHumanDecisionFeedback(decision),
    retireRule: (ruleId) => socStore.retireRule(ruleId),
    keepRule: (ruleId) => socStore.keepRule(ruleId),
    verifyAuditChain: () => socStore.verifyAuditChain(),
    runTamperTest: (simulate) => socStore.runTamperTest(simulate),

    // Phase 4 Advanced Scenario Simulator
    simulationState: socStore.getSimulationState(),
    simulationSnapshots: socStore.getSimulationSnapshots(),
    simulationEvents: socStore.getSimulationEvents(),
    scenarioPresets: socStore.getScenarioPresets(),
    setSimulationScenario: (id) => socStore.setSimulationScenario(id),
    setAttackMode: (mode) => socStore.setAttackMode(mode),
    setNoiseLevel: (level) => socStore.setNoiseLevel(level),
    setReplaySpeed: (speed) => socStore.setReplaySpeed(speed),
    toggleAdversarialMode: () => socStore.toggleAdversarialMode(),
    startSimulation: () => socStore.startSimulation(),
    pauseSimulation: () => socStore.pauseSimulation(),
    resumeSimulation: () => socStore.resumeSimulation(),
    resetSimulation: () => socStore.resetSimulation(),
    captureSnapshot: () => socStore.captureSnapshot(),
    
    // Actions & Mutators
    setActiveIncidentId: (id: string) => socStore.setActiveIncidentId(id),
    approveRequest: (requestId: string, analystId: string) => socStore.approveRequest(requestId, analystId),
    rejectRequest: (requestId: string, analystId: string, reason: string) => socStore.rejectRequest(requestId, analystId, reason),
    overrideRequest: (requestId, selectedAction, reason, analyst) => socStore.overrideRequest(requestId, selectedAction, reason, analyst),
    escalateRequest: (requestId, escalateTo, reason, analyst) => socStore.escalateRequest(requestId, escalateTo, reason, analyst),
    rollbackAction: (actionId, analyst) => socStore.rollbackAction(actionId, analyst),
    executeResponseAction: (actionId: string) => socStore.executeResponseAction(actionId),
    submitAnalystFeedback: (feedback: AnalystFeedback) => socStore.submitAnalystFeedback(feedback),
    setIncidentStatus: (incidentId: string, status: IncidentStatus) => socStore.setIncidentStatus(incidentId, status),
    proposeRemediation: (incidentId: string) => socStore.proposeRemediation(incidentId),
    markNotificationRead: (id: string) => socStore.markNotificationRead(id),
    resetStore: () => socStore.resetStore(),
  };

  return <SOCContext.Provider value={value}>{children}</SOCContext.Provider>;
};

export const useSOC = () => {
  const ctx = useContext(SOCContext);
  if (!ctx) {
    throw new Error('useSOC must be used within a SOCProvider');
  }
  return ctx;
};


