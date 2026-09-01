// The single data source every page reads through `useSOC()`. This used
// to hold static mock JSON; it now holds a cache of what the real Sentinel
// SOC backend last returned, kept warm by a WebSocket subscription and
// refreshed by explicit calls after every mutation. The public method
// surface is unchanged on purpose — SOCContext.tsx and the page
// components were already built against "getters return a cached array,
// mutators call something and then the cache updates," which is exactly
// the shape a real backend needs too.
import {
  Incident,
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
  Severity,
  IncidentStatus,
} from '../types/soc';
import { backendApi, setToken, clearToken, connectWebSocket, ApiError } from './backendApi';
import {
  adaptIncident,
  adaptIncidentTimeline,
  adaptEvent,
  adaptLedgerToEvidence,
  adaptAction,
  adaptApproval,
  adaptSafetyEvent,
  adaptFeedback,
  adaptFeedbackStats,
  adaptRule,
  adaptOverride,
  adaptTrustMetrics,
  adaptAuditIntegrity,
  adaptTamperTest,
  adaptDashboard,
  adaptAIAnalysis,
} from './adapters';

export interface SOCNotification {
  id: string;
  timestamp: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  link?: string;
  read?: boolean;
}

type StoreListener = () => void;

/** One raw WebSocket frame, forwarded untouched to pipeline observers. */
export interface PipelineMessage {
  kind: string;
  payload: any;
  at: number;
}

const EMPTY_AI_ANALYSIS = (incidentId: string, title: string): AIAnalysis => ({
  incidentId,
  threatName: title,
  confidence: 0,
  summary: 'Analysis has not loaded yet.',
  explanation: [],
  indicators: [],
  rootCause: '',
  riskAssessment: '',
  recommendedPlaybook: '',
  decisionSupport: { whyAct: [], whyWait: [], riskIfIgnored: '', alternatives: [], historicalPrecedent: { totalSimilar: 0, isolatedCount: 0, alternativeCount: 0, successRate: 'n/a' } },
  claims: [],
  dataSources: { emailCount: 0, endpointCount: 0, identityCount: 0, networkCount: 0, totalCount: 0 },
  knownLimitations: [],
  aiTransparency: { totalGenerated: 0, verifiedCount: 0, removedCount: 0, removedClaims: [] },
});

class SOCStore {
  private listeners: Set<StoreListener> = new Set();

  private incidents: Incident[] = [];
  private events: SecurityEvent[] = [];
  private evidence: Evidence[] = [];
  private aiAnalyses: Record<string, AIAnalysis> = {};
  private aiAnalysisFetching: Set<string> = new Set();
  private responseActions: ResponseAction[] = [];
  private approvals: ApprovalRequest[] = [];
  private safetyEvents: AISafetyEvent[] = [];
  private feedbackList: AnalystFeedback[] = [];
  private feedbackStats = { totalSubmitted: 0, confirmedCount: 0, falsePositivesCount: 0, modifiedCount: 0, accuracyPercentage: 0 };
  private detectionRules: DetectionRule[] = [];
  private ruleOverrides: RuleOverrideItem[] = [];
  private auditIntegrity: AuditIntegrityState = {
    status: 'VALID', entriesChecked: 0, algorithm: 'SHA-256 hash chain + Ed25519 signature',
    signature: 'not yet verified', lastVerified: '',
  };
  private trustMetrics: TrustMetrics = { accepted: 0, rejected: 0, overridden: 0, total: 0, trustScore: 100, history: [], topAcceptedTypes: [] };
  private dashboard: DashboardMetrics & {
    threatActivity?: any[]; threatTypes?: any[]; opsSummary?: Record<string, number>;
    playbooks?: any[]; systemHealthScore?: number;
    healthChecks?: Record<string, boolean> | null; healthLabel?: string;
    risk?: {
      worst_score: number | null; deterministic: number | null;
      ai_delta: number | null; incident_id: string | null; open_incidents: number;
    } | null;
    trustScore?: number | null;
  } = {
    totalEvents: 0, activeIncidents: 0, criticalThreats: 0, highThreats: 0, mediumThreats: 0,
    pendingApprovals: 0, aiInvestigationsCount: 0, systemStatus: 'OPERATIONAL', threatTrend: [], severityDistribution: [],
  };
  private graphCache: Record<string, { nodes: AttackNodeItem[]; edges: AttackEdgeItem[] }> = {};

  private authUser: AuthUser | null = null;
  private isAuthenticated = false;
  private autonomyMode: AutonomyMode = 'ACT_AND_NOTIFY';
  private aiEnabled = true;

  private activeIncidentId = '';
  private notifications: SOCNotification[] = [];
  private ws: WebSocket | null = null;

  // Phase 4 simulator fields are cosmetic mirrors — the backend has one
  // real scenario engine, not independently-controllable noise/replay
  // dials. Kept so the Simulator page still renders sensibly.
  private simulationState: SimulationState = {
    status: 'IDLE', scenarioId: '', scenarioName: 'Phishing → Ransomware (scripted)',
    attackMode: 'CLEAN_BASELINE', noiseLevel: 'MEDIUM', replaySpeed: 1, adversarialMode: false,
    elapsedTimeSeconds: 0, eventCount: 0, activeStage: 'Idle',
  };
  private simulationSnapshots: SimulationSnapshot[] = [];
  private simulationEvents: SimulationEventItem[] = [];

  public subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  // ── raw pipeline tap ───────────────────────────────────────────────
  // The Live Threat page needs the socket messages themselves, not the
  // digested cache the rest of the app reads: its whole job is to show
  // detection happening in the order it actually happens. Everything
  // below is a passive observer — no message is consumed here, so
  // removing this tap cannot change how the app behaves.
  private pipelineListeners: Set<(m: PipelineMessage) => void> = new Set();

  public subscribePipeline(fn: (m: PipelineMessage) => void): () => void {
    this.pipelineListeners.add(fn);
    return () => this.pipelineListeners.delete(fn);
  }

  private emitPipeline(kind: string, payload: any) {
    const msg: PipelineMessage = { kind, payload, at: Date.now() };
    this.pipelineListeners.forEach((fn) => {
      // One badly-behaved observer must not break the socket handler.
      try { fn(msg); } catch { /* ignore */ }
    });
  }

  // ── auth ───────────────────────────────────────────────────────────
  public getAuthUser(): AuthUser | null {
    return this.authUser;
  }
  public getIsAuthenticated(): boolean {
    return this.isAuthenticated;
  }

  public async login(email: string, password: string): Promise<boolean> {
    try {
      const res = await backendApi.login(email, password);
      setToken(res.access_token);
      this.authUser = {
        email,
        name: res.user.name,
        role: res.user.role,
        avatarInitials: res.user.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase(),
      };
      this.isAuthenticated = true;
      this.pushNotification({
        id: `NOTIF-${Date.now()}`, timestamp: new Date().toISOString(),
        title: 'Session Authenticated', message: `Logged in as ${res.user.name} (${res.user.role})`, type: 'success',
      });
      this.connectSocket();
      await this.refreshAll();
      return true;
    } catch (e) {
      clearToken();
      this.isAuthenticated = false;
      this.authUser = null;
      const message = e instanceof ApiError ? e.message : 'Login failed';
      this.pushNotification({
        id: `NOTIF-${Date.now()}`, timestamp: new Date().toISOString(),
        title: 'Authentication Failed', message, type: 'error',
      });
      this.notify();
      return false;
    }
  }

  /** Called once on app mount — if a token survived a page refresh,
   * validate it and rehydrate the session instead of bouncing to login. */
  public async tryRestoreSession(): Promise<void> {
    const { getToken } = await import('./backendApi');
    if (!getToken()) return;
    try {
      const me = await backendApi.me();
      this.authUser = {
        email: '', name: me.name, role: me.role,
        avatarInitials: me.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase(),
      };
      this.isAuthenticated = true;
      this.connectSocket();
      await this.refreshAll();
    } catch {
      clearToken();
      this.isAuthenticated = false;
      this.authUser = null;
    }
    this.notify();
  }

  public logout() {
    clearToken();
    this.isAuthenticated = false;
    this.authUser = null;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.notify();
  }

  public getAutonomyMode(): AutonomyMode {
    return this.autonomyMode;
  }

  public async setAutonomyMode(mode: AutonomyMode) {
    if (mode === 'FULL_AUTO_DISABLED') return;
    const backendMode = { ALWAYS_ASK: 'always_ask', RECOMMEND_ONLY: 'recommend_only', ACT_AND_NOTIFY: 'act_and_notify' }[mode];
    try {
      await backendApi.setAutonomy(backendMode!);
      this.autonomyMode = mode;
      this.pushNotification({
        id: `NOTIF-${Date.now()}`, timestamp: new Date().toISOString(),
        title: 'Autonomy Policy Updated', message: `Global Autonomy Mode updated to: ${mode.replace(/_/g, ' ')}`, type: 'info',
      });
    } catch (e) {
      this.pushError('Could not update autonomy mode', e);
    }
  }

  // ── AI enable/disable (the real master switch) ──────────────────────
  public getAIEnabled(): boolean {
    return this.aiEnabled;
  }

  public async setAIEnabled(enabled: boolean) {
    try {
      await backendApi.setAI(enabled);
      this.aiEnabled = enabled;
      this.pushNotification({
        id: `NOTIF-${Date.now()}`, timestamp: new Date().toISOString(),
        title: enabled ? 'AI Assistance Enabled' : 'AI Assistance Disabled',
        message: enabled
          ? 'AI explanations and advisory decision support restored.'
          : 'AI assistance disabled. Rules, correlation, tiers, and human governance remain ACTIVE — this is the property the whole system is built to prove.',
        type: enabled ? 'info' : 'warning',
      });
    } catch (e) {
      this.pushError('Could not toggle AI', e);
    }
  }

  public toggleAI() {
    this.setAIEnabled(!this.aiEnabled);
  }

  // ── AI decision intelligence (per-incident, lazy + cached) ──────────
  public getAIAnalysis(incidentId?: string): AIAnalysis {
    const id = incidentId || this.activeIncidentId;
    if (!id) return EMPTY_AI_ANALYSIS('', 'No incident selected');
    if (this.aiAnalyses[id]) return this.aiAnalyses[id];
    this.fetchAIAnalysis(id);
    const inc = this.getIncidentById(id);
    return EMPTY_AI_ANALYSIS(id, inc?.title || id);
  }

  private async fetchAIAnalysis(id: string) {
    if (this.aiAnalysisFetching.has(id)) return;
    this.aiAnalysisFetching.add(id);
    try {
      const [incidentRow, explanation, alternatives, ttm, remediation] = await Promise.all([
        backendApi.getIncident(id),
        backendApi.explanation(id).catch(() => null),
        backendApi.alternatives(id).catch(() => []),
        backendApi.trustTimeMachine(id).catch(() => null),
        backendApi.getRemediation(id).catch(() => null),
      ]);
      this.aiAnalyses[id] = adaptAIAnalysis(incidentRow, explanation, alternatives, ttm, remediation);
      this.notify();
    } catch {
      /* keep the placeholder; a retry happens next time this getter is called */
    } finally {
      this.aiAnalysisFetching.delete(id);
    }
  }

  public async proposeRemediation(incidentId: string) {
    try {
      await backendApi.proposeRemediation(incidentId);
      delete this.aiAnalyses[incidentId];
      await this.fetchAIAnalysis(incidentId);
      this.pushNotification({
        id: `NOTIF-${Date.now()}`, timestamp: new Date().toISOString(),
        title: 'Remediation Plan Proposed',
        message: `A new response plan was drafted for ${incidentId}.`,
        type: 'success',
      });
    } catch (e) {
      this.pushError('Could not propose a remediation plan', e);
    }
  }

  public getDecisionSupport(incidentId?: string): DecisionSupport {
    return this.getAIAnalysis(incidentId).decisionSupport!;
  }
  public getAIClaims(incidentId?: string): AIClaim[] {
    return this.getAIAnalysis(incidentId).claims || [];
  }
  public getDataSourceSummary(incidentId?: string): DataSourceSummary {
    return this.getAIAnalysis(incidentId).dataSources!;
  }
  public getKnownLimitations(incidentId?: string): KnownLimitation[] {
    return this.getAIAnalysis(incidentId).knownLimitations || [];
  }
  public getAITransparency(incidentId?: string): AITransparency {
    return this.getAIAnalysis(incidentId).aiTransparency!;
  }

  // ── trust, rules, audit (Phase 3) ────────────────────────────────────
  public getTrustMetrics(): TrustMetrics {
    return this.trustMetrics;
  }
  public recordHumanDecisionFeedback(_decision: 'ACCEPTED' | 'REJECTED' | 'OVERRIDDEN') {
    // The real trust score is derived from the ledger server-side; refresh
    // it rather than mutate a local counter that could drift from the truth.
    this.fetchTrustMetrics();
  }

  public getDetectionRules(): DetectionRule[] {
    return this.detectionRules;
  }

  public async retireRule(ruleId: string) {
    try {
      await backendApi.retireRule(ruleId);
      await this.fetchRules();
      this.pushNotification({
        id: `NOTIF-${Date.now()}`, timestamp: new Date().toISOString(),
        title: 'Detection Rule Retired', message: `Rule ${ruleId} retired following human review.`, type: 'warning',
      });
    } catch (e) {
      this.pushError(`Could not retire ${ruleId}`, e);
    }
  }

  public keepRule(ruleId: string) {
    // The backend doesn't need a separate "keep" state — a rule not
    // retired is already active. Surfaced as a local acknowledgement.
    this.pushNotification({
      id: `NOTIF-${Date.now()}`, timestamp: new Date().toISOString(),
      title: 'Rule Retained', message: `Rule ${ruleId} stays active; no retirement recorded.`, type: 'info',
    });
  }

  public getRuleOverrides(): RuleOverrideItem[] {
    return this.ruleOverrides;
  }

  public getAuditIntegrity(): AuditIntegrityState {
    return this.auditIntegrity;
  }

  public async verifyAuditChain(): Promise<AuditIntegrityState> {
    try {
      const [verify, pubKey] = await Promise.all([
        backendApi.verifyLedger(),
        backendApi.ledgerPublicKey().catch(() => undefined),
      ]);
      this.auditIntegrity = adaptAuditIntegrity(verify, this.evidence.length, pubKey?.public_key);
      this.pushNotification({
        id: `NOTIF-${Date.now()}`, timestamp: new Date().toISOString(),
        title: 'Audit Chain Verified',
        message: `Verified cryptographic signatures across ${this.auditIntegrity.entriesChecked} ledger entries.`,
        type: this.auditIntegrity.status === 'VALID' ? 'success' : 'error',
      });
      this.notify();
    } catch (e) {
      this.pushError('Ledger verification failed', e);
    }
    return this.auditIntegrity;
  }

  public async runTamperTest(simulateTampering: boolean = true): Promise<AuditIntegrityState> {
    if (!simulateTampering) return this.verifyAuditChain();
    try {
      const result = await backendApi.tamperTest();
      this.auditIntegrity = adaptTamperTest(result, this.auditIntegrity);
      this.pushNotification({
        id: `NOTIF-${Date.now()}`, timestamp: new Date().toISOString(),
        title: 'Tamper Test Complete',
        message: result.note || 'Simulated corruption flagged by verification, as designed.',
        type: 'error',
      });
      this.notify();
    } catch (e) {
      this.pushError('Tamper test failed', e);
    }
    return this.auditIntegrity;
  }

  // ── Phase 4 simulator — cosmetic controls over the one real scenario ─
  public getSimulationState(): SimulationState {
    return this.simulationState;
  }
  public getSimulationSnapshots(): SimulationSnapshot[] {
    return this.simulationSnapshots;
  }
  public getSimulationEvents(): SimulationEventItem[] {
    return this.simulationEvents;
  }
  public getScenarioPresets(): ScenarioPreset[] {
    return [
      {
        id: 'live', name: 'Live Backend Scenario', totalEvents: this.dashboard.totalEvents || 0,
        description: 'The real seven-step scripted attack the backend runs — phishing, endpoint compromise, identity abuse, a prompt-injection attempt, ransomware staging, and human-approved containment.',
        defaultAttackMode: 'SINGLE',
        stages: ['Baseline', 'Phishing', 'Endpoint Compromise', 'Identity Abuse', 'Adversarial Content', 'Ransomware Staging', 'Human Approval'],
      },
    ];
  }
  public setSimulationScenario(_id: string) {
    /* one real scenario; nothing to switch */
  }
  public setAttackMode(mode: AttackMode) {
    this.simulationState.attackMode = mode;
    this.notify();
  }
  public setNoiseLevel(level: NoiseLevel) {
    this.simulationState.noiseLevel = level;
    this.notify();
  }
  public setReplaySpeed(speed: ReplaySpeed) {
    this.simulationState.replaySpeed = speed;
    this.notify();
  }
  public toggleAdversarialMode() {
    this.pushNotification({
      id: `NOTIF-${Date.now()}`, timestamp: new Date().toISOString(),
      title: 'Adversarial content is scripted, not toggled',
      message: 'The real scenario always includes one prompt-injection attempt at step 5 — that is what Step 5 demonstrates being blocked.',
      type: 'info',
    });
  }
  public startSimulation() {
    import('./realtimeService').then(({ realtimeService }) => realtimeService.startDemo());
  }
  public pauseSimulation() {
    import('./realtimeService').then(({ realtimeService }) => realtimeService.pauseDemo());
  }
  public resumeSimulation() {
    import('./realtimeService').then(({ realtimeService }) => realtimeService.resumeDemo());
  }
  public resetSimulation() {
    import('./realtimeService').then(({ realtimeService }) => realtimeService.resetDemo());
  }
  public captureSnapshot(): SimulationSnapshot {
    const snap: SimulationSnapshot = {
      id: `SNP-${Date.now().toString().slice(-4)}`, timestamp: new Date().toISOString(),
      scenarioName: this.simulationState.scenarioName, attackMode: this.simulationState.attackMode,
      activeIncidents: this.incidents.filter((i) => i.status !== 'CONTAINED').length,
      eventCount: this.dashboard.totalEvents || 0, noiseLevel: this.simulationState.noiseLevel,
      replaySpeed: this.simulationState.replaySpeed, aiEnabled: this.aiEnabled,
    };
    this.simulationSnapshots.unshift(snap);
    this.notify();
    return snap;
  }

  /** Called by realtimeService as backend demo state changes, so the
   * simulator page's status/stage reflect the real run. */
  public syncSimulationFromDemo(step: { title: string; stepIndex: number }, isRunning: boolean) {
    this.simulationState.status = isRunning ? 'RUNNING' : step.stepIndex > 0 ? 'PAUSED' : 'IDLE';
    this.simulationState.activeStage = step.title;
    this.simulationState.attackMode = step.stepIndex === 0 ? 'CLEAN_BASELINE' : 'SINGLE';
    this.notify();
  }

  // ── standard getters ─────────────────────────────────────────────────
  public getIncidents(): Incident[] {
    return this.incidents;
  }
  public getIncidentById(id: string): Incident | undefined {
    return this.incidents.find((i) => i.id === id);
  }
  public getActiveIncident(): Incident | undefined {
    return this.getIncidentById(this.activeIncidentId) || this.incidents[0];
  }
  public getActiveIncidentId(): string {
    return this.activeIncidentId;
  }
  public getEvents(incidentId?: string): SecurityEvent[] {
    if (!incidentId) return this.events;
    const cached = this.events.filter((e) => e.incidentId === incidentId);
    if (cached.length === 0) this.fetchIncidentEvents(incidentId);
    return cached;
  }

  private async fetchIncidentEvents(incidentId: string) {
    try {
      const row = await backendApi.getIncident(incidentId);
      const mapped = adaptIncidentTimeline(row);
      this.events = [...this.events.filter((e) => e.incidentId !== incidentId), ...mapped];
      this.notify();
    } catch {
      /* leave empty; caller can retry */
    }
  }

  public getAttackNodes(unlockedCount?: number): AttackNodeItem[] {
    const id = this.activeIncidentId;
    const cached = id ? this.graphCache[id]?.nodes : undefined;
    if (!cached) {
      if (id) this.fetchGraph(id);
      return [];
    }
    if (unlockedCount === undefined) return cached;
    if (unlockedCount === 0) return cached.slice(0, 1);
    return cached.slice(0, Math.min(unlockedCount, cached.length));
  }

  public getAttackEdges(unlockedCount?: number): AttackEdgeItem[] {
    const id = this.activeIncidentId;
    const cached = id ? this.graphCache[id]?.edges : undefined;
    if (!cached) return [];
    const nodes = this.getAttackNodes(unlockedCount);
    const nodeIds = new Set(nodes.map((n) => n.id));
    return cached.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
  }

  private async fetchGraph(incidentId: string) {
    try {
      const raw = await backendApi.graph(incidentId);
      const { adaptGraph } = await import('./graphAdapter');
      this.graphCache[incidentId] = adaptGraph(raw);
      this.notify();
    } catch {
      /* leave empty */
    }
  }

  public getEvidence(incidentId?: string): Evidence[] {
    if (!incidentId) return this.evidence;
    return this.evidence.filter((e) => e.incidentId === incidentId);
  }

  public getResponseActions(incidentId?: string): ResponseAction[] {
    const targetId = incidentId || this.activeIncidentId;
    return this.responseActions.filter((a) => a.incidentId === targetId);
  }
  public getApprovals(): ApprovalRequest[] {
    return this.approvals;
  }
  public getPendingApprovals(): ApprovalRequest[] {
    return this.approvals.filter((a) => a.status === 'PENDING' || a.status === 'PARTIALLY_APPROVED');
  }
  public getAISafetyEvents(): AISafetyEvent[] {
    return this.safetyEvents;
  }
  public getFeedbackList(): AnalystFeedback[] {
    return this.feedbackList;
  }
  public getFeedbackStats() {
    return this.feedbackStats;
  }
  public getNotifications(): SOCNotification[] {
    return this.notifications;
  }
  public getDemoStepIndex(): number {
    return 0; // superseded by realtimeService, kept for interface compatibility
  }

  public getSystemStatus(): 'OPERATIONAL' | 'DEGRADED' | 'ATTACK_IN_PROGRESS' | 'HUMAN_APPROVAL_REQUIRED' | 'THREAT_CONTAINED' {
    if (this.getPendingApprovals().length > 0) return 'HUMAN_APPROVAL_REQUIRED';
    const critical = this.incidents.find((i) => i.severity === 'CRITICAL' && i.status !== 'CONTAINED' && i.status !== 'RESOLVED');
    if (critical) return 'ATTACK_IN_PROGRESS';
    const anyContained = this.incidents.some((i) => i.status === 'CONTAINED');
    if (anyContained) return 'THREAT_CONTAINED';
    return 'OPERATIONAL';
  }

  public getMetrics(): DashboardMetrics {
    return this.dashboard;
  }
  public getDashboardExtras() {
    return {
      threatActivity: this.dashboard.threatActivity || [],
      threatTypes: this.dashboard.threatTypes || [],
      opsSummary: this.dashboard.opsSummary || {},
      playbooks: this.dashboard.playbooks || [],
      // `?? 100` here had the same effect as in the adapter: a dashboard
      // that had not loaded yet reported perfect health.
      systemHealthScore: this.dashboard.systemHealthScore ?? 0,
      healthChecks: this.dashboard.healthChecks ?? null,
      healthLabel: this.dashboard.healthLabel ?? 'Health unknown',
      risk: this.dashboard.risk ?? null,
      trustScore: this.dashboard.trustScore ?? null,
    };
  }

  /** Re-fetch just the threat-activity series for a different window.
   *  The dashboard's range control used to set a label and nothing else —
   *  it toggled between "Last 24 Hours" and "Last 7 Days" while every
   *  number under it stayed on the 24h series, which is worse than having
   *  no control at all. */
  public async setActivityWindow(window: '24h' | '7d'): Promise<void> {
    try {
      const raw = await backendApi.timeseries('alerts', window);
      const values: number[] = raw?.series?.[0]?.values || [];
      this.dashboard.threatActivity = (raw?.buckets || []).map((time: string, i: number) => ({
        time,
        events: values[i] || 0,
      }));
      this.notify();
    } catch {
      /* leave the previous series in place rather than blanking the chart */
    }
  }

  // ── mutators & actions ───────────────────────────────────────────────
  public setActiveIncidentId(id: string) {
    this.activeIncidentId = id;
    this.notify();
    if (!this.aiAnalyses[id]) this.fetchAIAnalysis(id);
    if (!this.graphCache[id]) this.fetchGraph(id);
  }

  public async approveRequest(requestId: string, analystId: string) {
    try {
      await backendApi.approveAction(requestId, `Approved by ${analystId} from the governance queue.`);
      this.recordHumanDecisionFeedback('ACCEPTED');
      await this.refreshActionsAndIncidents();
    } catch (e) {
      this.pushError('Approval failed', e);
    }
  }

  public async rejectRequest(requestId: string, analystId: string, reason: string) {
    try {
      await backendApi.rejectAction(requestId, reason || `Rejected by ${analystId}`);
      this.recordHumanDecisionFeedback('REJECTED');
      await this.refreshActionsAndIncidents();
    } catch (e) {
      this.pushError('Rejection failed', e);
    }
  }

  public async overrideRequest(requestId: string, selectedActionTitle: string, overrideReason: string, analystId: string) {
    const kind = this.titleToActionKind(selectedActionTitle);
    try {
      await backendApi.overrideAction(requestId, kind, `${overrideReason} (via ${analystId})`);
      this.recordHumanDecisionFeedback('OVERRIDDEN');
      await this.fetchRules();
      await this.refreshActionsAndIncidents();
    } catch (e) {
      this.pushError('Override failed', e);
    }
  }

  public async escalateRequest(requestId: string, _escalateTo: string, escalationReason: string, analystId: string) {
    // The backend computes the escalation target itself (next role above
    // the acting principal) — it does not accept a client-chosen target.
    try {
      await backendApi.escalateAction(requestId, 'next_role', `${escalationReason} (by ${analystId})`);
      await this.refreshActionsAndIncidents();
    } catch (e) {
      this.pushError('Escalation failed', e);
    }
  }

  public async rollbackAction(actionId: string, _analystId: string) {
    try {
      await backendApi.rollbackAction(actionId);
      await this.refreshActionsAndIncidents();
    } catch (e) {
      this.pushError('Rollback failed', e);
    }
  }

  public async executeResponseAction(actionId: string) {
    // Tier 0/1 actions are auto-executed by the backend the moment they're
    // proposed; anything still pending here needs the approval path.
    const action = this.responseActions.find((a) => a.id === actionId);
    if (!action) return;
    if (action.status === 'PENDING' && action.tier !== 'TIER_0') {
      await this.approveRequest(actionId, this.authUser?.name || 'Analyst');
      return;
    }
    this.pushNotification({
      id: `NOTIF-${Date.now()}`, timestamp: new Date().toISOString(),
      title: 'Already handled', message: 'Low-tier actions execute automatically as soon as the backend proposes them.', type: 'info',
    });
  }

  public async submitAnalystFeedback(feedback: AnalystFeedback) {
    const verdict = { CONFIRM: 'tp', FALSE_POSITIVE: 'fp', MODIFY: 'needs_review' }[feedback.decision];
    try {
      await backendApi.submitFeedback(feedback.incidentId, verdict!, feedback.reason);
      await this.fetchFeedback();
      this.pushNotification({
        id: `NOTIF-${Date.now()}`, timestamp: new Date().toISOString(),
        title: 'Feedback Recorded', message: `Feedback for ${feedback.incidentId}: ${feedback.decision}`, type: 'info',
      });
    } catch (e) {
      this.pushError('Feedback submission failed', e);
    }
  }

  public async setIncidentStatus(incidentId: string, status: IncidentStatus) {
    const backendStatus = { OPEN: 'open', INVESTIGATING: 'investigating', CONTAINED: 'contained', RESOLVED: 'resolved', CLOSED: 'closed' }[status];
    try {
      await backendApi.setIncidentStatus(incidentId, backendStatus!);
      await this.fetchIncidents();
      this.notify();
      this.pushNotification({
        id: `NOTIF-${Date.now()}`, timestamp: new Date().toISOString(),
        title: 'Incident Status Updated', message: `${incidentId} marked ${status}`, type: 'success',
      });
    } catch (e) {
      this.pushError('Could not update incident status', e);
    }
  }

  public addSafetyEvent(_event: AISafetyEvent) {
    // Safety events are derived server-side from real signals; refresh
    // instead of accepting a client-authored one.
    this.fetchAISafety();
  }

  public pushNotification(notification: SOCNotification) {
    this.notifications.unshift(notification);
    if (this.notifications.length > 20) this.notifications.pop();
    this.notify();
  }

  public async markNotificationRead(id: string) {
    const n = this.notifications.find((x) => x.id === id);
    if (!n || n.read) return;
    n.read = true;
    this.notify();
    if (id.startsWith('SRV-')) {
      const backendId = Number(id.slice(4));
      try {
        await backendApi.markNotificationRead(backendId);
      } catch {
        /* already updated optimistically; a later refresh will reconcile */
      }
    }
  }

  private pushError(title: string, e: unknown) {
    const message = e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e);
    this.pushNotification({ id: `NOTIF-${Date.now()}`, timestamp: new Date().toISOString(), title, message, type: 'error' });
  }

  public resetStore() {
    this.incidents = [];
    this.events = [];
    this.evidence = [];
    this.aiAnalyses = {};
    this.responseActions = [];
    this.approvals = [];
    this.safetyEvents = [];
    this.feedbackList = [];
    this.graphCache = {};
    this.activeIncidentId = '';
    this.notifications = [];
    this.notify();
    this.refreshAll();
  }

  // ── campaign links (real feature the mock frontend never had) ───────
  public async requestCampaignLinks() {
    try {
      await backendApi.requestLinks();
    } catch (e) {
      this.pushError('Could not request campaign link proposals', e);
    }
  }

  // ── bulk refresh, called after login / demo steps / mutations ──────
  public async refreshAll(): Promise<void> {
    await Promise.all([
      this.fetchIncidents(),
      this.fetchActions(),
      this.fetchDashboard(),
      this.fetchLedger(),
      this.fetchRules(),
      this.fetchAISafety(),
      this.fetchFeedback(),
      this.fetchTrustMetrics(),
      this.fetchNotifications(),
    ]);
    if (!this.activeIncidentId && this.incidents.length) {
      this.activeIncidentId = [...this.incidents].sort((a, b) => b.riskScore - a.riskScore)[0].id;
    }
    this.notify();
  }

  private async refreshActionsAndIncidents() {
    // Approving/rejecting/overriding/escalating/rolling back an action
    // changes that action's status, which is exactly what the incident
    // detail page's remediation-plan view shows per step — but that view
    // reads from `aiAnalyses`, a separate cache this refresh never used to
    // touch, so it kept showing "PENDING" after a successful approval
    // until something else happened to trigger a refetch. Clearing it
    // here means the next read (the lazy Proxy in SOCContext) fetches
    // fresh data instead of serving the stale pre-decision snapshot.
    this.aiAnalyses = {};
    await Promise.all([this.fetchActions(), this.fetchIncidents(), this.fetchDashboard(), this.fetchLedger()]);
    this.notify();
  }

  private async fetchIncidents() {
    try {
      const res = await backendApi.listIncidents('all');
      this.incidents = res.items.map(adaptIncident);
    } catch { /* keep previous cache on transient failure */ }
  }

  private async fetchActions() {
    try {
      const res = await backendApi.listActions('all');
      this.responseActions = res.items.map(adaptAction);
      const riskById: Record<string, number> = {};
      this.incidents.forEach((i) => (riskById[i.id] = i.riskScore));
      this.approvals = res.items
        .filter((a: any) => (a.tier ?? 0) >= 2)
        .map((a: any) => adaptApproval(a, riskById[a.incident_id]));
    } catch { /* keep previous cache */ }
  }

  private async fetchDashboard() {
    try {
      const raw = await backendApi.dashboard();
      this.dashboard = adaptDashboard(raw, this.incidents);
    } catch { /* keep previous cache */ }
  }

  private async fetchLedger() {
    try {
      const rows = await backendApi.listLedger(200);
      this.evidence = rows.map(adaptLedgerToEvidence);
    } catch { /* keep previous cache */ }
  }

  private async fetchRules() {
    try {
      const res = await backendApi.listRules();
      this.detectionRules = res.rules.map(adaptRule);
      this.ruleOverrides = (res.overrides || []).map(adaptOverride);
    } catch { /* keep previous cache */ }
  }

  private async fetchAISafety() {
    try {
      const res = await backendApi.aiSafetyEvents();
      this.safetyEvents = res.items.map(adaptSafetyEvent);
    } catch { /* keep previous cache */ }
  }

  private async fetchFeedback() {
    try {
      const [list, stats] = await Promise.all([backendApi.listFeedback(50), backendApi.feedbackStats()]);
      this.feedbackList = list.items.map(adaptFeedback);
      this.feedbackStats = adaptFeedbackStats(stats);
    } catch { /* keep previous cache */ }
  }

  private async fetchTrustMetrics() {
    try {
      const raw = await backendApi.trustMetrics();
      this.trustMetrics = adaptTrustMetrics(raw);
      this.notify();
    } catch { /* keep previous cache */ }
  }

  private async fetchNotifications() {
    try {
      const res = await backendApi.notifications();
      // Merge server notifications (approvals, escalations) in with any
      // purely-local ones already shown this session. De-duplicated — and
      // updated in place — by the real backend id, not by title: several
      // distinct pending approvals can legitimately share the exact same
      // title ("Approval required: Isolate host"), and the server is the
      // authority on `read` state (e.g. auto-marked read once the analyst
      // resolves the underlying action from anywhere in the app), so a
      // re-fetch must overwrite the cached copy rather than skip it.
      const server: SOCNotification[] = (res.items || []).map((n: any) => ({
        id: `SRV-${n.id}`, timestamp: n.at || new Date().toISOString(),
        title: n.title, message: n.body || '', type: n.kind === 'security' ? 'warning' : 'info',
        link: n.link || undefined, read: !!n.read,
      }));
      const byId = new Map(this.notifications.map((n) => [n.id, n]));
      for (const n of server) byId.set(n.id, n);
      this.notifications = Array.from(byId.values())
        .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
        .slice(0, 20);
    } catch { /* keep previous cache */ }
  }

  private titleToActionKind(title: string): string {
    const known = [
      'collect_forensics', 'snapshot_host', 'enrich_indicator', 'notify_analyst', 'quarantine_email',
      'block_hash', 'force_reauth', 'revoke_session', 'suspend_account', 'isolate_host', 'block_domain',
      'mass_isolate', 'disable_service_account',
    ];
    const slug = title.toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '');
    return known.find((k) => slug.includes(k) || k.includes(slug)) || known.find((k) => title.toLowerCase().includes(k.split('_')[0])) || 'isolate_host';
  }

  // ── WebSocket — live push, so the cache updates without polling ────
  private connectSocket() {
    if (this.ws) return;
    this.ws = connectWebSocket(async (msg) => {
      // Tap first, so the Live Threat page sees every stage in the order
      // the backend produced it, including the kinds the switch below
      // deliberately ignores (ai.thinking, remediation.proposed, …).
      this.emitPipeline(msg.kind, msg.payload);
      switch (msg.kind) {
        case 'incident.updated':
        case 'alert':
        case 'alert.flood':
        case 'graph.delta':
          await this.fetchIncidents();
          await this.fetchDashboard();
          this.notify();
          break;
        case 'action.executed':
        case 'action.pending':
        case 'action.rolled_back':
        case 'action.dismissed':
        case 'approval.required':
          await this.refreshActionsAndIncidents();
          break;
        case 'demo.step':
        case 'demo.playing':
        case 'demo.started': {
          // refreshFromBackend() syncs simulationState itself now.
          const { realtimeService } = await import('./realtimeService');
          await realtimeService.refreshFromBackend();
          await this.refreshAll();
          break;
        }
        case 'ai.links':
          this.pushNotification({
            id: `NOTIF-${Date.now()}`, timestamp: new Date().toISOString(),
            title: 'Campaign link proposed', message: msg.payload?.message || 'The model proposed a campaign link.', type: 'info',
          });
          break;
        case 'notification':
          await this.fetchNotifications();
          this.notify();
          break;
        default:
          break;
      }
    });
    this.ws.onclose = () => {
      this.ws = null;
      if (this.isAuthenticated) setTimeout(() => this.connectSocket(), 3000);
    };
  }
}

export const socStore = new SOCStore();
