import {
  PipelineStageId,
  PipelineStageConfig,
  LiveSimulationState,
  LiveTelemetryEvent,
  LiveSigmaDetection,
  LiveAIEvaluation,
  LiveIncidentData,
  LiveResponseRecommendation,
  LiveAuditTrailEntry,
} from '../types/liveSimulation';

const INITIAL_STAGES: PipelineStageConfig[] = [
  {
    id: 'EVENT_GENERATED',
    order: 1,
    label: 'Event Generated',
    shortDesc: 'Synthetic email & auth telemetry ingestion',
    status: 'PENDING',
  },
  {
    id: 'EVENT_PROCESSED',
    order: 2,
    label: 'Event Processed',
    shortDesc: 'Telemetry normalization & multi-source correlation',
    status: 'PENDING',
  },
  {
    id: 'SIGMA_DETECTED',
    order: 3,
    label: 'Sigma Rule Detection',
    shortDesc: 'Simulated rule match on credential access sequence',
    status: 'PENDING',
  },
  {
    id: 'AI_EVALUATED',
    order: 4,
    label: 'AI Evaluation',
    shortDesc: 'Dual-path threat reasoning & confidence calculation',
    status: 'PENDING',
  },
  {
    id: 'INCIDENT_CREATED',
    order: 5,
    label: 'Incident Created',
    shortDesc: 'Creation of INC-LIVE-001 in open incident store',
    status: 'PENDING',
  },
  {
    id: 'RESPONSE_RECOMMENDED',
    order: 6,
    label: 'Response Recommended',
    shortDesc: 'Remediation playbook formulation (Action ≠ Execution)',
    status: 'PENDING',
  },
  {
    id: 'HUMAN_APPROVAL',
    order: 7,
    label: 'Human Approval Required',
    shortDesc: 'Governance safety interlock waiting for analyst choice',
    status: 'PENDING',
  },
  {
    id: 'RESPONSE_EXECUTED',
    order: 8,
    label: 'Response Executed',
    shortDesc: 'Simulated containment action execution',
    status: 'PENDING',
  },
  {
    id: 'AUDIT_RECORDED',
    order: 9,
    label: 'Audit Recorded',
    shortDesc: 'Cryptographic hash-chained audit trail finalized',
    status: 'PENDING',
  },
];

// Helper to compute realistic SHA-256 hash
async function sha256(message: string): Promise<string> {
  try {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
      const msgBuffer = new TextEncoder().encode(message);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    // fallback
  }
  // Deterministic fallback hash generator
  let hash = 0;
  for (let i = 0; i < message.length; i++) {
    const char = message.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    .slice(0, 32) + Math.abs(hash).toString(16).padStart(16, '0') + '0000000000000000'.slice(0, 16);
}

const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

export const INITIAL_LIVE_SIMULATION_STATE: LiveSimulationState = {
  status: 'IDLE',
  currentStage: 'EVENT_GENERATED',
  stages: INITIAL_STAGES,
  speed: 1,
  elapsedSeconds: 0,
  event: null,
  processedTelemetry: null,
  sigmaDetection: null,
  aiEvaluation: null,
  incident: null,
  recommendation: null,
  approvalDecision: null,
  executionResult: null,
  auditTrail: [],
};

type Listener = (state: LiveSimulationState) => void;

class LiveThreatSimulationService {
  private state: LiveSimulationState = { ...INITIAL_LIVE_SIMULATION_STATE };
  private listeners: Set<Listener> = new Set();
  private timer: number | null = null;
  private elapsedTimer: number | null = null;
  private prevAuditHash: string = GENESIS_HASH;

  public getState(): LiveSimulationState {
    return this.state;
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const copy = {
      ...this.state,
      stages: this.state.stages.map((s) => ({ ...s })),
      auditTrail: [...this.state.auditTrail],
    };
    this.listeners.forEach((fn) => fn(copy));
  }

  public setSpeed(speed: 0.5 | 1 | 2 | 4) {
    this.state.speed = speed;
    this.notify();
  }

  private getStageDuration(stageId: PipelineStageId): number {
    const baseDurations: Record<PipelineStageId, number> = {
      EVENT_GENERATED: 1400,
      EVENT_PROCESSED: 1600,
      SIGMA_DETECTED: 1500,
      AI_EVALUATED: 2000,
      INCIDENT_CREATED: 1300,
      RESPONSE_RECOMMENDED: 1500,
      HUMAN_APPROVAL: 0, // Interlock: wait for human action
      RESPONSE_EXECUTED: 1800,
      AUDIT_RECORDED: 1200,
    };
    return Math.max(250, Math.round(baseDurations[stageId] / this.state.speed));
  }

  private async addAuditEntry(
    eventType: LiveAuditTrailEntry['eventType'],
    actor: string,
    source: string,
    status: LiveAuditTrailEntry['status'],
    details: string,
    incidentId?: string,
    evidenceRef?: string
  ) {
    const seq = this.state.auditTrail.length + 1;
    const nowIso = new Date().toISOString();
    const parentHash = this.prevAuditHash;
    const rawPayload = `${seq}|${nowIso}|${eventType}|${actor}|${source}|${status}|${details}|${parentHash}`;
    const hash = await sha256(rawPayload);
    this.prevAuditHash = hash;

    const entry: LiveAuditTrailEntry = {
      id: `AUD-LIVE-${seq.toString().padStart(3, '0')}`,
      sequenceNumber: seq,
      timestamp: nowIso,
      eventType,
      actor,
      source,
      status,
      incidentId: incidentId || 'INC-LIVE-001',
      evidenceRef,
      details,
      hash,
      parentHash,
    };

    this.state.auditTrail.unshift(entry);
  }

  public startSimulation() {
    if (this.state.status === 'RUNNING') return;

    if (this.state.status === 'COMPLETED' || this.state.status === 'HALTED') {
      this.resetSimulation();
    }

    this.state.status = 'RUNNING';
    this.startElapsedCounter();
    this.notify();

    // Begin progression from current stage
    this.advanceToStage(this.state.currentStage || 'EVENT_GENERATED');
  }

  public pauseSimulation() {
    if (this.state.status !== 'RUNNING') return;
    this.clearScheduledTimer();
    this.state.status = 'PAUSED';
    this.notify();
  }

  public resumeSimulation() {
    if (this.state.status !== 'PAUSED') return;
    this.state.status = 'RUNNING';
    this.startElapsedCounter();
    this.notify();
    this.advanceToStage(this.state.currentStage);
  }

  public resetSimulation() {
    this.clearScheduledTimer();
    this.stopElapsedCounter();
    this.prevAuditHash = GENESIS_HASH;
    this.state = {
      ...INITIAL_LIVE_SIMULATION_STATE,
      stages: INITIAL_STAGES.map((s) => ({ ...s, status: 'PENDING' })),
      speed: this.state.speed,
      auditTrail: [],
    };
    this.notify();
  }

  private startElapsedCounter() {
    this.stopElapsedCounter();
    this.elapsedTimer = window.setInterval(() => {
      if (this.state.status === 'RUNNING') {
        this.state.elapsedSeconds += 1;
        this.notify();
      }
    }, 1000);
  }

  private stopElapsedCounter() {
    if (this.elapsedTimer) {
      clearInterval(this.elapsedTimer);
      this.elapsedTimer = null;
    }
  }

  private clearScheduledTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async advanceToStage(stageId: PipelineStageId) {
    this.clearScheduledTimer();
    if (this.state.status !== 'RUNNING') return;

    this.state.currentStage = stageId;
    this.setStageStatus(stageId, 'PROCESSING');
    this.notify();

    const duration = this.getStageDuration(stageId);

    this.timer = window.setTimeout(async () => {
      await this.executeStageLogic(stageId);
    }, duration);
  }

  private setStageStatus(stageId: PipelineStageId, status: PipelineStageConfig['status'], details?: string) {
    this.state.stages = this.state.stages.map((s) => {
      if (s.id === stageId) {
        return {
          ...s,
          status,
          timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
          details: details || s.details,
        };
      }
      return s;
    });
  }

  private async executeStageLogic(stageId: PipelineStageId) {
    const timestampIso = new Date().toISOString();

    switch (stageId) {
      case 'EVENT_GENERATED': {
        const syntheticEvent: LiveTelemetryEvent = {
          id: 'EVT-LIVE-001',
          timestamp: timestampIso,
          source: 'Email Gateway',
          severity: 'HIGH',
          eventType: 'Phishing Link Clicked & Credential Interception',
          user: 'analyst.smith@sentinel.local',
          host: 'WORKSTATION-04',
          ip: '198.51.100.44',
          summary: 'User analyst.smith clicked verified credential phishing link disguised as corporate SSO re-verification.',
          rawPayload: {
            alert_id: 'EVT-LIVE-001',
            timestamp: timestampIso,
            source: 'Email_Gateway_Defender_Sim',
            subject: 'URGENT: Mandatory Single Sign-On Security Renewal',
            recipient: 'analyst.smith@sentinel.local',
            sender: 'security-alerts@login-ms-update.identity-security-check.com',
            action: 'link_clicked_and_submitted',
            destination_url: 'hxxps://login-ms-update.identity-security-check.com/auth/login?user=analyst.smith',
            client_ip: '198.51.100.44',
            client_device: 'WORKSTATION-04 (Windows 11 Ent 23H2)',
            geo_asn: 'AS13335 (External Proxy / Data Center)',
          },
          normalizedFields: {
            protocol: 'HTTPS',
            status_code: 200,
            credential_transmitted: true,
            risk_classification: 'SUSPECTED_CREDENTIAL_THEFT',
            mitre_ref: 'T1566.002',
          },
          correlationTags: ['Phishing', 'Credential Access', 'Identity Anomaly', 'Endpoint Ingestion'],
        };

        this.state.event = syntheticEvent;
        this.setStageStatus('EVENT_GENERATED', 'COMPLETED', 'EVT-LIVE-001 ingested from Email Gateway');
        await this.addAuditEntry(
          'EVENT_GENERATED',
          'Simulation Engine',
          'Email Gateway',
          'SUCCESS',
          'Generated synthetic phishing payload telemetry EVT-LIVE-001 (User: analyst.smith@sentinel.local)',
          undefined,
          'EVT-LIVE-001'
        );
        this.notify();
        this.advanceToStage('EVENT_PROCESSED');
        break;
      }

      case 'EVENT_PROCESSED': {
        this.state.processedTelemetry = {
          normalized: true,
          correlatedSources: ['Email Gateway', 'Entra ID Identity Logs', 'Endpoint EDR Sensor (WORKSTATION-04)'],
          riskIndicatorsFound: 3,
        };
        this.setStageStatus('EVENT_PROCESSED', 'COMPLETED', 'Signals normalized & correlated across 3 telemetry pipelines');
        await this.addAuditEntry(
          'EVENT_PROCESSED',
          'Telemetry Pipeline',
          'Event Correlator',
          'COMPLETED',
          'Normalized EVT-LIVE-001 and mapped correlation across Identity + Email + Host WORKSTATION-04'
        );
        this.notify();
        this.advanceToStage('SIGMA_DETECTED');
        break;
      }

      case 'SIGMA_DETECTED': {
        const detection: LiveSigmaDetection = {
          ruleId: 'SOC-AUTH-001',
          ruleTitle: 'Suspicious Authentication After Phishing Event',
          severity: 'HIGH',
          matchStatus: 'MATCH',
          matchedEventId: 'EVT-LIVE-001',
          category: 'Identity Security / Credential Abuse',
          mitreTactic: 'Credential Access & Initial Access',
          mitreTechnique: 'Spearphishing Link -> Valid Accounts',
          mitreId: 'T1566.002 / T1078',
          detectionLogic: `detection:
  selection_email:
    event_type: 'phishing_link_clicked'
    recipient: 'analyst.smith@sentinel.local'
  selection_auth:
    event_type: 'token_exchange_success'
    ip_delta: 'geo_anomaly_detected'
  timeframe: 4m
  condition: selection_email and selection_auth`,
          timestamp: timestampIso,
          isSimulated: true,
        };

        this.state.sigmaDetection = detection;
        this.setStageStatus('SIGMA_DETECTED', 'COMPLETED', 'Matched Rule SOC-AUTH-001 (Suspicious Auth after Phishing)');
        await this.addAuditEntry(
          'SIGMA_DETECTION',
          'Sigma Engine (Simulated)',
          'SOC-AUTH-001',
          'MATCH',
          'Rule SOC-AUTH-001 triggered: Phishing link click succeeded by immediate anomalous token exchange',
          'INC-LIVE-001',
          'SOC-AUTH-001'
        );
        this.notify();
        this.advanceToStage('AI_EVALUATED');
        break;
      }

      case 'AI_EVALUATED': {
        const aiEvaluation: LiveAIEvaluation = {
          assessment: 'Likely identity compromise following a phishing event. Session tokens replayed from unverified IP 198.51.100.44.',
          confidenceScore: 92,
          threatCategory: 'Active Identity Abuse & Credential Access',
          rootCause: 'Employee analyst.smith was targeted with high-fidelity corporate credential harvester; adversary acquired active SSO session token.',
          whyAct: [
            'Attacker possesses valid active session cookies bypassing primary MFA credentials.',
            'Telemetry observes initial lateral reconnaissance queries targeting internal sensitive repositories.',
            'Identity blast radius spans privileged access permissions across corporate workspace.',
          ],
          whyWait: [
            'Minor possibility of legitimate employee traveling with cellular VPN (low likelihood given 4m latency from phishing click).',
          ],
          riskIfIgnored: 'Full domain identity compromise, data exfiltration, and ransomware staging within < 30 minutes.',
          evidenceReferences: [
            { label: 'Ingested Telemetry', refId: 'EVT-LIVE-001', significance: 'Phishing link execution confirmed' },
            { label: 'Sigma Rule Match', refId: 'SOC-AUTH-001', significance: 'Temporal correlation within 4 minutes' },
            { label: 'Host Context', refId: 'WORKSTATION-04', significance: 'Endpoint session active' },
          ],
          isSimulated: true,
        };

        this.state.aiEvaluation = aiEvaluation;
        this.setStageStatus('AI_EVALUATED', 'COMPLETED', 'Dual-path AI calculated 92% confidence threat verdict');
        await this.addAuditEntry(
          'AI_EVALUATION',
          'Dual-Path AI Analyst',
          'AI Reasoning Model',
          'COMPLETED',
          'AI Assessment: 92% Confidence score. Recommended rapid session revocation to halt lateral identity spread.',
          'INC-LIVE-001',
          'AI-VERDICT-92'
        );
        this.notify();
        this.advanceToStage('INCIDENT_CREATED');
        break;
      }

      case 'INCIDENT_CREATED': {
        const liveIncident: LiveIncidentData = {
          id: 'INC-LIVE-001',
          title: 'Suspected Identity Compromise via Phishing',
          severity: 'HIGH',
          status: 'OPEN',
          riskScore: 88,
          affectedUser: 'analyst.smith@sentinel.local',
          affectedHost: 'WORKSTATION-04',
          attackVector: 'Email Gateway -> Identity Token Replay',
          createdTimestamp: timestampIso,
        };

        this.state.incident = liveIncident;
        this.setStageStatus('INCIDENT_CREATED', 'COMPLETED', 'Created INC-LIVE-001 with Risk Score 88/100');
        await this.addAuditEntry(
          'INCIDENT_CREATED',
          'Incident Manager',
          'SOC Case Engine',
          'SUCCESS',
          'Created Incident INC-LIVE-001 (Severity: HIGH, Risk Score: 88/100, Target: analyst.smith)',
          'INC-LIVE-001'
        );
        this.notify();
        this.advanceToStage('RESPONSE_RECOMMENDED');
        break;
      }

      case 'RESPONSE_RECOMMENDED': {
        const recommendation: LiveResponseRecommendation = {
          playbookName: 'Identity Containment & Credential Reset',
          actionTitle: 'Revoke active sessions',
          targetScope: 'User: analyst.smith@sentinel.local',
          governanceTier: 'Tier 2 (Sensitive - Reversible)',
          riskLevel: 'MEDIUM',
          reversibility: 'YES',
          justification: 'Revoking active tokens invalidates attacker session cookies immediately while preserving user account data and mailbox contents.',
          alternatives: [
            {
              id: 'ALT-1',
              title: 'Trigger MFA Step-Up Challenge Only',
              description: 'Force re-authentication without terminating ongoing active web sessions.',
              tier: 'Tier 1',
              risk: 'Low',
              tradeoff: 'Allows attacker to retain already-established SSO sessions for up to 60 minutes.',
            },
            {
              id: 'ALT-2',
              title: 'Isolate Host WORKSTATION-04 & Disable Account',
              description: 'Sever network connectivity to the endpoint and completely disable user in Active Directory.',
              tier: 'Tier 3',
              risk: 'High',
              tradeoff: 'High business disruption. Stops all work for user and locks local device.',
            },
          ],
          executionStatus: 'PENDING_APPROVAL',
        };

        this.state.recommendation = recommendation;
        this.setStageStatus('RESPONSE_RECOMMENDED', 'COMPLETED', 'Proposed "Revoke active sessions" (Tier 2 Sensitive)');
        await this.addAuditEntry(
          'RESPONSE_RECOMMENDED',
          'Playbook Engine',
          'Policy Governance',
          'PENDING',
          'Formulated Recommendation: Revoke active sessions for analyst.smith (Tier 2 Sensitive - Reversible)',
          'INC-LIVE-001'
        );
        this.notify();
        this.advanceToStage('HUMAN_APPROVAL');
        break;
      }

      case 'HUMAN_APPROVAL': {
        // SAFETY INTERLOCK: AUTOMATICALLY PAUSE AND WAIT FOR HUMAN DECISION
        this.clearScheduledTimer();
        this.state.status = 'WAITING_FOR_APPROVAL';
        this.setStageStatus('HUMAN_APPROVAL', 'WAITING_FOR_APPROVAL', 'Safety Interlock Engaged: Awaiting Named Analyst Authorization');
        await this.addAuditEntry(
          'APPROVAL_REQUESTED',
          'Governance Interlock',
          'Human Approval Queue',
          'PENDING',
          'Safety Interlock Engaged: High-impact action "Revoke active sessions" held for mandatory human authorization.',
          'INC-LIVE-001'
        );
        this.notify();
        break;
      }

      case 'RESPONSE_EXECUTED': {
        const chosenAction = this.state.approvalDecision?.selectedActionTitle || this.state.recommendation?.actionTitle || 'Revoke active sessions';
        this.state.executionResult = {
          success: true,
          executedAction: chosenAction,
          target: 'analyst.smith@sentinel.local',
          timestamp: timestampIso,
          verifiedStatus: 'Active session tokens revoked across Entra ID & Google Workspace (Simulated)',
        };

        if (this.state.incident) {
          this.state.incident.status = 'CONTAINED';
          this.state.incident.updatedTimestamp = timestampIso;
        }

        this.setStageStatus('RESPONSE_EXECUTED', 'COMPLETED', `Action "${chosenAction}" successfully executed`);
        await this.addAuditEntry(
          'RESPONSE_EXECUTED',
          'Automated Actuator (Simulated)',
          'Identity Gateway Connector',
          'SUCCESS',
          `Successfully executed containment: "${chosenAction}" on analyst.smith@sentinel.local. Threat isolated.`,
          'INC-LIVE-001'
        );
        this.notify();
        this.advanceToStage('AUDIT_RECORDED');
        break;
      }

      case 'AUDIT_RECORDED': {
        this.setStageStatus('AUDIT_RECORDED', 'COMPLETED', 'Full hash-chain verified and sealed');
        await this.addAuditEntry(
          'AUDIT_COMPLETED',
          'Cryptographic Ledger',
          'SHA-256 Audit Registry',
          'COMPLETED',
          'End-to-end simulation workflow verified, tamper-evident hash chain locked and registered.',
          'INC-LIVE-001'
        );
        this.state.status = 'COMPLETED';
        this.stopElapsedCounter();
        this.notify();
        break;
      }
    }
  }

  // ── HUMAN DECISION CONTROLS ────────────────────────────────────────────────

  public async handleApprove(analystName = 'admin@sentinel.local (SOC Manager)') {
    if (this.state.status !== 'WAITING_FOR_APPROVAL') return;

    this.state.approvalDecision = {
      decision: 'APPROVE',
      actor: analystName,
      timestamp: new Date().toISOString(),
      reason: 'Correlated telemetry confirms session hijack following email phishing click.',
      selectedActionTitle: this.state.recommendation?.actionTitle || 'Revoke active sessions',
    };

    if (this.state.recommendation) {
      this.state.recommendation.executionStatus = 'APPROVED';
    }

    this.setStageStatus('HUMAN_APPROVAL', 'COMPLETED', `Approved by ${analystName}`);
    await this.addAuditEntry(
      'ANALYST_APPROVED',
      analystName,
      'Approval Dashboard',
      'APPROVED',
      `Analyst approved execution of "${this.state.approvalDecision.selectedActionTitle}". Proceeding to governed execution.`,
      'INC-LIVE-001'
    );

    this.state.status = 'RUNNING';
    this.startElapsedCounter();
    this.notify();
    this.advanceToStage('RESPONSE_EXECUTED');
  }

  public async handleReject(reason = 'False positive or permitted administrative testing', analystName = 'admin@sentinel.local (SOC Manager)') {
    if (this.state.status !== 'WAITING_FOR_APPROVAL') return;

    this.state.approvalDecision = {
      decision: 'REJECT',
      actor: analystName,
      timestamp: new Date().toISOString(),
      reason,
    };

    if (this.state.recommendation) {
      this.state.recommendation.executionStatus = 'REJECTED';
    }
    if (this.state.incident) {
      this.state.incident.status = 'REJECTED';
    }

    this.setStageStatus('HUMAN_APPROVAL', 'REJECTED', `Rejected by ${analystName}`);
    this.setStageStatus('RESPONSE_EXECUTED', 'FAILED', 'Response execution skipped due to human rejection');
    this.setStageStatus('AUDIT_RECORDED', 'COMPLETED', 'Rejection recorded in audit trail');

    await this.addAuditEntry(
      'ANALYST_REJECTED',
      analystName,
      'Approval Dashboard',
      'REJECTED',
      `Analyst REJECTED proposed action. Reason: "${reason}". Response execution aborted safely.`,
      'INC-LIVE-001'
    );

    await this.addAuditEntry(
      'AUDIT_COMPLETED',
      'Cryptographic Ledger',
      'SHA-256 Audit Registry',
      'HALTED',
      'Simulation ended safely without executing response actions.',
      'INC-LIVE-001'
    );

    this.state.status = 'HALTED';
    this.stopElapsedCounter();
    this.notify();
  }

  public async handleOverride(selectedActionTitle: string, reason = 'Operator preference for alternative containment scope', analystName = 'admin@sentinel.local (SOC Manager)') {
    if (this.state.status !== 'WAITING_FOR_APPROVAL') return;

    this.state.approvalDecision = {
      decision: 'OVERRIDE',
      actor: analystName,
      timestamp: new Date().toISOString(),
      reason,
      selectedActionTitle,
    };

    if (this.state.recommendation) {
      this.state.recommendation.actionTitle = selectedActionTitle;
      this.state.recommendation.executionStatus = 'OVERRIDDEN';
    }

    this.setStageStatus('HUMAN_APPROVAL', 'OVERRIDDEN', `Overridden to "${selectedActionTitle}" by ${analystName}`);
    await this.addAuditEntry(
      'ANALYST_OVERRIDDEN',
      analystName,
      'Approval Dashboard',
      'OVERRIDDEN',
      `Analyst OVERRODE recommendation to "${selectedActionTitle}". Reason: "${reason}". Proceeding to execute alternative.`,
      'INC-LIVE-001'
    );

    this.state.status = 'RUNNING';
    this.startElapsedCounter();
    this.notify();
    this.advanceToStage('RESPONSE_EXECUTED');
  }

  public async handleEscalate(escalateTo = 'Tier 3 / Senior Incident Commander', reason = 'Elevated blast radius requires commander sign-off', analystName = 'arjun@sentinel.local (Analyst)') {
    if (this.state.status !== 'WAITING_FOR_APPROVAL') return;

    this.state.approvalDecision = {
      decision: 'ESCALATE',
      actor: analystName,
      timestamp: new Date().toISOString(),
      reason,
      escalateToRole: escalateTo,
    };

    if (this.state.recommendation) {
      this.state.recommendation.executionStatus = 'ESCALATED';
    }
    if (this.state.incident) {
      this.state.incident.status = 'ESCALATED';
    }

    this.setStageStatus('HUMAN_APPROVAL', 'ESCALATED', `Escalated to ${escalateTo} by ${analystName}`);
    this.setStageStatus('RESPONSE_EXECUTED', 'PENDING', 'Holding execution pending Tier 3 Escalation review');
    this.setStageStatus('AUDIT_RECORDED', 'COMPLETED', 'Escalation recorded in immutable ledger');

    await this.addAuditEntry(
      'ANALYST_ESCALATED',
      analystName,
      'Approval Dashboard',
      'ESCALATED',
      `Analyst ESCALATED request to "${escalateTo}". Reason: "${reason}". Action execution deferred.`,
      'INC-LIVE-001'
    );

    await this.addAuditEntry(
      'AUDIT_COMPLETED',
      'Cryptographic Ledger',
      'SHA-256 Audit Registry',
      'HALTED',
      'Simulation safely transitioned to Tier 3 Escalation queue.',
      'INC-LIVE-001'
    );

    this.state.status = 'HALTED';
    this.stopElapsedCounter();
    this.notify();
  }
}

export const liveThreatSimulationService = new LiveThreatSimulationService();
