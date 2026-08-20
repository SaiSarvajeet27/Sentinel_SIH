// Maps the backend's cytoscape-shaped incident subgraph
// (`GET /api/incidents/{id}/graph`) into React Flow's node/edge shape.
// The backend graph is a real entity graph (who touched what, in what
// order) — it has no notion of a 2D layout, so positions are computed
// here: nodes are grouped into a row per entity type and ordered by the
// timestamp of the edge that first mentions them, which reads left-to-
// right as roughly chronological.
import { AttackNodeItem, AttackEdgeItem, AttackNodeData, Severity } from '../types/soc';

const ROW_FOR_TYPE: Record<string, number> = {
  host: 0,
  user: 1,
  proc: 2,
  process: 2,
  ip: 3,
  email: 3,
  domain: 3,
};

const ICON_FOR_TYPE: Record<string, AttackNodeData['iconType']> = {
  host: 'terminal',
  user: 'user',
  proc: 'terminal',
  process: 'terminal',
  ip: 'link',
  email: 'email',
  domain: 'link',
};

const ROLE_SEVERITY: Record<string, Severity> = {
  patient_zero: 'CRITICAL',
  compromised: 'HIGH',
  external: 'MEDIUM',
  touched: 'LOW',
};

const ROLE_STATUS: Record<string, AttackNodeData['status']> = {
  patient_zero: 'active',
  compromised: 'active',
  external: 'investigating',
  touched: 'investigating',
};

export function adaptGraph(raw: any): { nodes: AttackNodeItem[]; edges: AttackEdgeItem[] } {
  const rawNodes = raw?.elements?.nodes || [];
  const rawEdges = raw?.elements?.edges || [];

  // Earliest edge timestamp touching each node id, for left-to-right order.
  const firstSeen: Record<string, string> = {};
  for (const e of rawEdges) {
    const d = e.data;
    for (const id of [d.source, d.target]) {
      if (!firstSeen[id] || (d.ts && d.ts < firstSeen[id])) firstSeen[id] = d.ts || '';
    }
  }

  const rowCounts: Record<number, number> = {};
  const nodes: AttackNodeItem[] = [...rawNodes]
    .sort((a, b) => (firstSeen[a.data.id] || '').localeCompare(firstSeen[b.data.id] || ''))
    .map((n) => {
      const type = n.data.type || 'unknown';
      const row = ROW_FOR_TYPE[type] ?? 4;
      const col = rowCounts[row] ?? 0;
      rowCounts[row] = col + 1;
      const role = n.data.role || 'touched';

      return {
        id: n.data.id,
        type: 'attackNode',
        position: { x: 60 + col * 240, y: 60 + row * 160 },
        data: {
          label: n.data.label || n.data.id,
          stage: type.toUpperCase(),
          severity: ROLE_SEVERITY[role] || 'LOW',
          timestamp: firstSeen[n.data.id] || '',
          eventId: '',
          device: type === 'host' ? n.data.label : '',
          user: type === 'user' ? n.data.label : '',
          description: `${n.data.label} (${type}) — role: ${role.replace('_', ' ')}`,
          details: `Entity id: ${n.data.id}`,
          status: ROLE_STATUS[role] || 'investigating',
          iconType: ICON_FOR_TYPE[type] || 'file',
        } as AttackNodeData,
      };
    });

  // The backend's edge id is `source->target-ts`, which collides whenever
  // two events between the same pair land in the same second (batched
  // ingestion does this constantly) — React then warns about duplicate
  // keys and can drop/merge edges. Fold in the event id and the array
  // index so every edge gets a genuinely unique key.
  const edges: AttackEdgeItem[] = rawEdges.map((e: any, i: number) => ({
    id: `${e.data.id}-${e.data.event_id || i}`,
    source: e.data.source,
    target: e.data.target,
    animated: true,
    label: e.data.label,
  }));

  return { nodes, edges };
}
