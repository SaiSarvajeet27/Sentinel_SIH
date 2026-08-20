// Drives the REAL seven-step backend demo (app/services/demo.py), not a
// local timer. `startDemo`/`nextStep`/etc. call the backend; step state is
// read back from `GET /api/demo/state` (and pushed live over the socket
// socStore already listens on). There is no "previous step" on the
// backend — the chain only moves forward, driven by real event ingestion —
// so `prevStep()` is a no-op here rather than faking it.
import { backendApi } from './backendApi';
import { socStore } from './socStore';

export interface DemoStep {
  stepIndex: number;
  title: string;
  description: string;
  activeRoute: string;
  activeIncidentId: string;
  riskScore: number;
  unlockedEventsCount: number;
  unlockedNodesCount: number;
  requiresApproval: boolean;
  approvalStatus?: 'PENDING' | 'APPROVED';
  incidentStatus: 'OPEN' | 'INVESTIGATING' | 'CONTAINED';
}

// Index i is what the backend's step (i+1) maps onto in the UI. Steps 3-6
// used to point at now-removed standalone Graph/AI-Investigation/Response
// pages — that content lives in the incident detail tabs now, so those
// steps route to the incident itself once one exists (computed below).
const STEP_ROUTES = ['/', '/evidence', '/incidents', '/incidents', '/incidents', '/approvals', '/approvals'];

const IDLE_STEP: DemoStep = {
  stepIndex: 0,
  title: 'Idle',
  description: 'Waiting for the next auto-generated incident scenario.',
  activeRoute: '/',
  activeIncidentId: '',
  riskScore: 0,
  unlockedEventsCount: 0,
  unlockedNodesCount: 999,
  requiresApproval: false,
  incidentStatus: 'OPEN',
};

type Listener = (step: DemoStep, isRunning: boolean) => void;

function toDemoStep(raw: any): DemoStep {
  if (!raw || raw.step === 0) return IDLE_STEP;

  const idx = Math.max(0, Math.min(6, raw.step - 1));
  const incident = raw.incident_id ? socStore.getIncidentById(raw.incident_id) : undefined;
  const pending = socStore.getPendingApprovals().filter((a) => a.incidentId === raw.incident_id);
  const decided = socStore
    .getApprovals()
    .filter((a) => a.incidentId === raw.incident_id && a.status === 'APPROVED');

  // Once an incident exists, steps that used to open a standalone
  // Graph/AI/Response page now open that incident's detail view instead —
  // the tabs there cover the same content.
  const activeRoute = idx >= 2 && idx <= 5 && raw.incident_id
    ? `/incident/${raw.incident_id}`
    : STEP_ROUTES[idx] || '/';

  return {
    stepIndex: idx,
    title: raw.title || '',
    description: raw.caption || raw.expect || '',
    activeRoute,
    activeIncidentId: raw.incident_id || '',
    riskScore: incident?.riskScore ?? 0,
    unlockedEventsCount: raw.step,
    unlockedNodesCount: 999,
    requiresApproval: pending.length > 0,
    approvalStatus: pending.length > 0 ? 'PENDING' : decided.length > 0 ? 'APPROVED' : undefined,
    incidentStatus:
      incident?.status === 'CONTAINED' ? 'CONTAINED' : incident?.status === 'OPEN' && !incident ? 'OPEN' : incident ? 'INVESTIGATING' : 'OPEN',
  };
}

class RealtimeService {
  private currentStep: DemoStep = IDLE_STEP;
  private isRunning = false;
  private listeners: Set<Listener> = new Set();
  private pollTimer: number | null = null;

  public subscribe(listener: Listener) {
    this.listeners.add(listener);
    listener(this.currentStep, this.isRunning);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l(this.currentStep, this.isRunning));
  }

  /** Called by socStore whenever a WS `demo.step` / `demo.playing` frame
   * arrives, so this service stays in sync without polling while a
   * WebSocket connection is live. */
  public async refreshFromBackend() {
    try {
      const raw = await backendApi.demoState();
      this.currentStep = toDemoStep(raw);
      this.isRunning = !!raw.playing;
      this.notify();
      socStore.syncSimulationFromDemo(this.currentStep, this.isRunning);
      // The backend stops playing on its own once step 7 completes — the
      // poll loop started in startDemo() has no way to know that unless it
      // checks here. Without this it polls /api/demo/state every 2.5s
      // forever, and every tick fans out into socStore.refreshAll().
      if (!this.isRunning) this.stopPolling();
    } catch {
      /* transient — the next WS frame or poll will catch up */
    }
  }

  private startPolling() {
    this.stopPolling();
    this.pollTimer = window.setInterval(() => this.refreshFromBackend(), 2500);
  }

  private stopPolling() {
    if (this.pollTimer) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  public async startDemo() {
    await backendApi.demoStart(false);
    await backendApi.demoPlay();
    await socStore.refreshAll();
    await this.refreshFromBackend();
    this.startPolling();
  }

  public async pauseDemo() {
    await backendApi.demoPause();
    await this.refreshFromBackend();
    this.stopPolling();
  }

  public async resumeDemo() {
    if (this.currentStep.stepIndex >= 6 && !this.isRunning) {
      await this.startDemo();
      return;
    }
    await backendApi.demoPlay();
    await this.refreshFromBackend();
    this.startPolling();
  }

  public async nextStep() {
    await backendApi.demoNext();
    await socStore.refreshAll();
    await this.refreshFromBackend();
  }

  /** The backend has no "go back" — the chain is driven by real ingested
   * events. Surfaced as a no-op with a notification rather than faking
   * reverse progress against state that has actually happened. */
  public prevStep() {
    socStore.pushNotification({
      id: `NOTIF-${Date.now()}`,
      timestamp: new Date().toISOString(),
      title: 'Cannot step backward',
      message: 'The real demo is driven by events that have already been ingested — there is no undo for a step, only Reset.',
      type: 'info',
    });
  }

  public async resetDemo() {
    this.stopPolling();
    await backendApi.demoReset();
    await socStore.refreshAll();
    this.currentStep = IDLE_STEP;
    this.isRunning = false;
    this.notify();
  }

  public getCurrentStep(): DemoStep {
    return this.currentStep;
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }
}

export const realtimeService = new RealtimeService();
export const DEMO_STEPS: DemoStep[] = []; // kept for import compatibility; the backend is now the source of truth
