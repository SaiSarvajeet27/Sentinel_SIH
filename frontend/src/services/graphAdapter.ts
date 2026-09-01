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

  // Nodes are laid out in a row per entity type. Without a wrap, a busy
  // incident puts sixty hosts in one row at 240px each — a 14,000px-wide
  // strip that reads as a smear rather than a graph, and that no amount of
  // fitView can make legible. Wrap each type into a block of rows instead,
  // so the canvas stays roughly screen-shaped however many entities the
  // incident touches.
  const COLS_PER_ROW = 8;
  const COL_W = 240;
  const ROW_H = 160;

  // Each type gets a band tall enough for however many rows it wrapped to,
  // computed up front so bands cannot overlap each other.
  const perType: Record<number, number> = {};
  for (const n of rawNodes) {
    const row = ROW_FOR_TYPE[n.data.type || 'unknown'] ?? 4;
    perType[row] = (perType[row] ?? 0) + 1;
  }
  const bandTop: Record<number, number> = {};
  let y = 0;
  for (const band of Object.keys(perType).map(Number).sort((a, b) => a - b)) {
    bandTop[band] = y;
    y += Math.ceil(perType[band] / COLS_PER_ROW) * ROW_H;
  }

  const rowCounts: Record<number, number> = {};
  const nodes: AttackNodeItem[] = [...rawNodes]
    .sort((a, b) => (firstSeen[a.data.id] || '').localeCompare(firstSeen[b.data.id] || ''))
    .map((n) => {
      const type = n.data.type || 'unknown';
      const row = ROW_FOR_TYPE[type] ?? 4;
      const seq = rowCounts[row] ?? 0;
      rowCounts[row] = seq + 1;
      const col = seq % COLS_PER_ROW;
      const wrapped = Math.floor(seq / COLS_PER_ROW);
      const role = n.data.role || 'touched';

      return {
        id: n.data.id,
        type: 'attackNode',
        position: {
          x: 60 + col * COL_W,
          y: 60 + bandTop[row] + wrapped * ROW_H,
        },
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

  // The backend now collapses parallel edges, so one entry here is one
  // relationship and `e.data.id` (`source->target-rel`) is already unique.
  // The index stays in the key only as a defensive tiebreak.
  //
  // `animated` is deliberately conditional: every animated edge is an SVG
  // path running a CSS dash animation, and a few dozen of those repainting
  // each frame is what made this canvas stutter. Past a threshold the
  // motion communicates nothing anyway — it is one shimmering mass — so
  // spend it only when there are few enough edges to follow individually.
  const ANIMATE_MAX_EDGES = 40;
  const animate = rawEdges.length <= ANIMATE_MAX_EDGES;

  const edges: AttackEdgeItem[] = rawEdges.map((e: any, i: number) => {
    const count: number = e.data.count ?? 1;
    return {
      id: `${e.data.id}-${i}`,
      source: e.data.source,
      target: e.data.target,
      animated: animate,
      // Say how many times the relationship recurred rather than drawing it
      // that many times — the repetition is real information, and this is
      // where it survives the collapse.
      label: count > 1 ? `${e.data.label} ×${count}` : e.data.label,
    };
  });

  return { nodes, edges };
}
