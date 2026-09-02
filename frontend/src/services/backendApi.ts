// Thin, typed transport to the real Sentinel SOC backend (FastAPI).
// No mock data lives here — every function is a real HTTP call. Response
// shapes are intentionally loose (backend JSON); `adapters.ts` maps them
// into the strict frontend types in `types/soc.ts`.
export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';
const WS_BASE = API_BASE.replace(/^http/, 'ws');

const TOKEN_KEY = 'sentinel_token';

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(status: number, message: string, data: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function request<T>(path: string, method: string = 'GET', body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    if (res.status === 401) clearToken();
    const message = (data as { detail?: string })?.detail || res.statusText;
    throw new ApiError(res.status, message, data);
  }
  return data as T;
}

const get = <T>(path: string) => request<T>(path, 'GET');
const post = <T>(path: string, body?: unknown) => request<T>(path, 'POST', body);
const put = <T>(path: string, body?: unknown) => request<T>(path, 'PUT', body);

// ── auth ───────────────────────────────────────────────────────────────
export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: { id: string; name: string; role: string };
}
export interface MeResponse {
  id: string;
  name: string;
  role: string;
  can: Record<string, boolean>;
}

export const backendApi = {
  login: (email: string, password: string) =>
    post<LoginResponse>('/api/auth/login', { email, password }),
  me: () => get<MeResponse>('/api/me'),

  // ── demo engine (the real 7-step scripted attack) ──────────────────
  demoState: () => get<Record<string, any>>('/api/demo/state'),
  demoStart: (regenerate = false) =>
    post<Record<string, any>>(`/api/demo/start?regenerate=${regenerate}`),
  demoNext: () => post<Record<string, any>>('/api/demo/next'),
  demoPlay: () => post<Record<string, any>>('/api/demo/play'),
  demoPause: () => post<Record<string, any>>('/api/demo/pause'),
  demoReset: () => post<Record<string, any>>('/api/demo/reset'),
  generateScenario: () => post<Record<string, any>>('/api/scenarios/generate'),

  // ── dashboard & metrics ─────────────────────────────────────────────
  dashboard: () => get<Record<string, any>>('/api/dashboard'),
  timeseries: (metric = 'alerts', window = '24h') =>
    get<Record<string, any>>(`/api/metrics/timeseries?metric=${metric}&window=${window}`),
  health: () => get<Record<string, any>>('/api/health'),
  performance: () => get<Record<string, any>>('/api/performance'),
  benchmark: () => get<Record<string, any>>('/api/benchmark'),

  // ── incidents ────────────────────────────────────────────────────────
  listIncidents: (status: string = 'all') =>
    get<{ total: number; items: any[] }>(`/api/incidents?status=${status}`),
  getIncident: (id: string) => get<Record<string, any>>(`/api/incidents/${id}`),
  explanation: (id: string) => get<Record<string, any>>(`/api/incidents/${id}/explanation`),
  agentPipeline: (id: string) => get<Record<string, any>>(`/api/incidents/${id}/agent-pipeline`),
  trustTimeMachine: (id: string) => get<Record<string, any>>(`/api/incidents/${id}/trust-time-machine`),
  alternatives: (id: string) => get<any[]>(`/api/incidents/${id}/alternatives`),
  graph: (id: string) => get<Record<string, any>>(`/api/incidents/${id}/graph`),
  verdicts: (id: string) => get<Record<string, any>>(`/api/incidents/${id}/verdicts`),
  aiContribution: (id: string) => get<Record<string, any>>(`/api/incidents/${id}/ai-contribution`),
  submitFeedback: (id: string, verdict: string, reasonCode?: string) =>
    post<{ ok: boolean }>(`/api/incidents/${id}/feedback`, { verdict, reason_code: reasonCode }),
  setIncidentStatus: (id: string, status: string) =>
    put<{ incident_id: string; status: string }>(`/api/incidents/${id}/status`, { status }),

  proposeRemediation: (id: string) =>
    post<Record<string, any>>(`/api/incidents/${id}/remediation`),
  getRemediation: (id: string) => get<Record<string, any>>(`/api/incidents/${id}/remediation`),
  scoreAssist: (id: string) => post<Record<string, any>>(`/api/incidents/${id}/score-assist`),
  assess: (id: string) => post<Record<string, any>>(`/api/incidents/${id}/assess`),

  // ── AI assist ────────────────────────────────────────────────────────
  triage: () => post<Record<string, any>>('/api/assist/triage'),
  candidates: () => get<Record<string, any>>('/api/assist/candidates'),
  analyse: () => post<Record<string, any>>('/api/assist/analyse'),
  balance: () => get<Record<string, any>>('/api/assist/balance'),
  disagreements: () => get<{ total: number; items: any[] }>('/api/disagreements'),
  listLinks: (status = 'proposed') =>
    get<{ total: number; items: any[] }>(`/api/assist/links?status=${status}`),
  requestLinks: () => post<Record<string, any>>('/api/assist/links'),
  acceptLink: (id: number, reason: string) =>
    post<Record<string, any>>(`/api/assist/links/${id}/accept`, { reason }),
  declineLink: (id: number, reason: string) =>
    post<Record<string, any>>(`/api/assist/links/${id}/decline`, { reason }),

  // ── devices ──────────────────────────────────────────────────────────
  listDevices: (params: Record<string, string> = {}) =>
    get<{ total: number; devices: any[] }>(`/api/devices?${new URLSearchParams(params)}`),
  deviceAnalytics: () => get<Record<string, any>>('/api/devices/analytics'),
  deviceDetail: (id: string) => get<Record<string, any>>(`/api/devices/${id}`),

  // ── activity & events ────────────────────────────────────────────────
  activity: (params: Record<string, string> = {}) =>
    get<Record<string, any>>(`/api/activity?${new URLSearchParams(params)}`),
  listEvents: (incidentId?: string, limit = 200) =>
    get<{ total: number; items: any[] }>(
      `/api/events?limit=${limit}${incidentId ? `&incident_id=${incidentId}` : ''}`
    ),
  getEvent: (id: string) => get<Record<string, any>>(`/api/events/${id}`),

  // ── actions & approvals ─────────────────────────────────────────────
  listActions: (status = 'all') =>
    get<{ total: number; items: any[] }>(`/api/actions?status=${status}`),
  approveAction: (id: string, reason: string) =>
    post<Record<string, any>>(`/api/actions/${id}/approve`, { reason }),
  overrideAction: (id: string, chosenAction: string, reason: string) =>
    post<Record<string, any>>(`/api/actions/${id}/override`, { chosen_action: chosenAction, reason }),
  rejectAction: (id: string, reason: string) =>
    post<Record<string, any>>(`/api/actions/${id}/reject`, { reason }),
  escalateAction: (id: string, toRole: string, reason: string) =>
    post<Record<string, any>>(`/api/actions/${id}/escalate`, { to_role: toRole, reason }),
  dismissAction: (id: string, reason: string) =>
    post<Record<string, any>>(`/api/actions/${id}/dismiss`, { reason }),
  rollbackAction: (id: string) => post<Record<string, any>>(`/api/actions/${id}/rollback`),

  // ── ledger / audit ───────────────────────────────────────────────────
  listLedger: (limit = 100) => get<any[]>(`/api/ledger?limit=${limit}`),
  verifyLedger: () => post<Record<string, any>>('/api/ledger/verify'),
  tamperTest: () => post<Record<string, any>>('/api/ledger/tamper-test'),
  ledgerPublicKey: () => get<{ public_key: string }>('/api/ledger/public-key'),

  // ── rules ────────────────────────────────────────────────────────────
  listRules: () => get<Record<string, any>>('/api/rules'),
  retireRule: (id: string) => post<{ ok: boolean }>(`/api/rules/${id}/retire`),

  // ── settings ─────────────────────────────────────────────────────────
  getSettings: () => get<Record<string, any>>('/api/settings'),
  setAutonomy: (mode: string) => put<Record<string, any>>('/api/settings/autonomy', { mode }),
  setAI: (enabled: boolean) => put<Record<string, any>>('/api/settings/ai', { enabled }),
  aiUsage: () => get<Record<string, any>>('/api/ai/usage'),

  // ── notifications & search ──────────────────────────────────────────
  notifications: () => get<Record<string, any>>('/api/notifications'),
  markNotificationRead: (id: number) =>
    put<{ id: number; read: boolean }>(`/api/notifications/${id}/read`),
  search: (q: string) => get<Record<string, any>>(`/api/search?q=${encodeURIComponent(q)}`),

  // ── feedback (RLHF) ──────────────────────────────────────────────────
  listFeedback: (limit = 50) => get<{ items: any[] }>(`/api/feedback?limit=${limit}`),
  feedbackStats: () => get<Record<string, any>>('/api/feedback/stats'),

  // ── AI safety & trust ────────────────────────────────────────────────
  aiSafetyEvents: () => get<{ items: any[] }>('/api/ai-safety/events'),
  trustMetrics: () => get<Record<string, any>>('/api/trust/metrics'),
};

// ── WebSocket ──────────────────────────────────────────────────────────
export type WSMessage = { kind: string; payload: any };

export function connectWebSocket(onMessage: (msg: WSMessage) => void): WebSocket {
  const ws = new WebSocket(`${WS_BASE}/ws?access_token=${getToken()}`);
  ws.onmessage = (ev) => {
    try {
      onMessage(JSON.parse(ev.data));
    } catch {
      /* ignore malformed frames */
    }
  };
  return ws;
}
