// Ordinary (unconstrained) A* over a Loose Bearing graph — the baseline the constrained
// router (Stage 2) mirrors and the reference the detour factor (Stage 5) divides against.
// Cost g = accumulated edge length; heuristic h = straight-line haversine distance to the
// destination (admissible: it never overestimates the remaining road distance). Ties in f
// break on node id so the search is fully deterministic — no randomness, no timestamps.

import { haversineMeters } from "../geo/geo";
import { outEdges, type Graph, type Node } from "../graph/types";
import { BinaryHeap } from "./heap";

export type ShortestPath = { path: number[]; lengthMeters: number };

/** One entry waiting in the priority queue: a node with its known f = g + h. */
type Frontier = { id: number; g: number; f: number };

/** Index nodes by id (fixtures use id === index, but real artifacts need not). */
function nodeIndex(graph: Graph): Map<number, Node> {
  const byId = new Map<number, Node>();
  for (const n of graph.nodes) byId.set(n.id, n);
  return byId;
}

/**
 * Shortest path from `startId` to `endId` by road length, ignoring the bearing rule.
 * Returns the node-id path and its total length in meters, or null if `endId` is
 * unreachable (or either endpoint is absent from the graph).
 */
export function shortestPath(
  graph: Graph,
  startId: number,
  endId: number,
): ShortestPath | null {
  const byId = nodeIndex(graph);
  const start = byId.get(startId);
  const end = byId.get(endId);
  if (!start || !end) return null;

  if (startId === endId) return { path: [startId], lengthMeters: 0 };

  const h = (id: number): number => {
    const n = byId.get(id)!;
    return haversineMeters(n, end);
  };

  // Best known cost to reach each node, and the edge we arrived by (for reconstruction).
  const gScore = new Map<number, number>([[startId, 0]]);
  const cameFrom = new Map<number, number>();

  // Deterministic ordering: smaller f first; ties broken by smaller node id.
  const open = new BinaryHeap<Frontier>((a, b) =>
    a.f !== b.f ? a.f < b.f : a.id < b.id,
  );
  open.push({ id: startId, g: 0, f: h(startId) });

  while (open.size > 0) {
    const current = open.pop()!;
    // Lazy deletion: skip stale queue entries superseded by a cheaper path.
    if (current.g > (gScore.get(current.id) ?? Infinity)) continue;

    if (current.id === endId) {
      return { path: reconstruct(cameFrom, endId), lengthMeters: current.g };
    }

    for (const edge of outEdges(graph, current.id)) {
      const tentativeG = current.g + edge.lengthMeters;
      if (tentativeG < (gScore.get(edge.to) ?? Infinity)) {
        gScore.set(edge.to, tentativeG);
        cameFrom.set(edge.to, current.id);
        open.push({ id: edge.to, g: tentativeG, f: tentativeG + h(edge.to) });
      }
    }
  }

  return null;
}

/** Walk the came-from chain back from `endId` to the start, returning start→end order. */
function reconstruct(cameFrom: Map<number, number>, endId: number): number[] {
  const path = [endId];
  let cur = endId;
  while (cameFrom.has(cur)) {
    cur = cameFrom.get(cur)!;
    path.push(cur);
  }
  path.reverse();
  return path;
}
