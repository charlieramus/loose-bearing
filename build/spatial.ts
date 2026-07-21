// Nearest-node snapping index — a uniform lat/lng grid, cheap to rebuild at load time.
//
// Design decision (recorded in the Stage 5 report): we do NOT serialize the spatial index.
// Rebuilding it from the node array is a single O(N) pass and costs a fraction of the graph
// load, so shipping it would only bloat the artifact. V4 calls `buildGrid(graph.nodes)` right
// after `deserializeGraph`. This module is that shared builder.

import { haversineMeters, type LatLng } from "../src/geo/geo";
import type { Node } from "../src/graph/types";

/** ~0.003° ≈ 330 m cells: a click's nearest routable node is almost always in the 3×3 block. */
export const CELL_DEG = 0.003;

export type Grid = {
  cell: number;
  buckets: Map<string, number[]>; // "cx,cy" → node ids
  nodes: Node[];
};

const key = (cx: number, cy: number): string => `${cx},${cy}`;

export function buildGrid(nodes: Node[], cell: number = CELL_DEG): Grid {
  const buckets = new Map<string, number[]>();
  for (const n of nodes) {
    const cx = Math.floor(n.lat / cell);
    const cy = Math.floor(n.lng / cell);
    const k = key(cx, cy);
    const b = buckets.get(k);
    if (b) b.push(n.id);
    else buckets.set(k, [n.id]);
  }
  return { cell, buckets, nodes };
}

/**
 * Nearest node to `p`, searching outward ring by ring until a hit is found and confirmed
 * (one extra ring past the first hit, so a closer node in an adjacent cell isn't missed).
 * Returns null if nothing is within `maxRings` cells (~a few hundred meters).
 */
export function nearest(grid: Grid, p: LatLng, maxRings = 8): { id: number; meters: number } | null {
  const { cell, buckets, nodes } = grid;
  const cx = Math.floor(p.lat / cell);
  const cy = Math.floor(p.lng / cell);

  let best: { id: number; meters: number } | null = null;
  let foundAtRing = -1;

  for (let r = 0; r <= maxRings; r++) {
    // Stop one ring after the first hit — that margin guarantees correctness across cell edges.
    if (foundAtRing >= 0 && r > foundAtRing + 1) break;
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // ring perimeter only
        const b = buckets.get(key(cx + dx, cy + dy));
        if (!b) continue;
        for (const id of b) {
          const n = nodes[id];
          const d = haversineMeters(p, { lat: n.lat, lng: n.lng });
          if (!best || d < best.meters) best = { id, meters: d };
        }
      }
    }
    if (best && foundAtRing < 0) foundAtRing = r;
  }
  return best;
}
