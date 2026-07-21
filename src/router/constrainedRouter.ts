// The constrained router — A* that obeys the 90° bearing rule (THE product idea). It is
// the Stage 1 search with one change: when expanding a node, an out-edge is only relaxed
// if it is bearing-legal toward the destination. Legality of edge (u → v) depends solely
// on u's position and the fixed destination (never on how u was reached), so the rule just
// removes edges from a static subgraph — A* stays optimal and its haversine heuristic stays
// admissible (removing edges never shortens a remaining path). The angle math is imported
// from the V1 geo core and the ONE predicate in bearingRule; it is never reimplemented here.

import { haversineMeters, initialBearingDeg } from "../geo/geo";
import { isBearingLegal } from "../geo/bearingRule";
import { outEdges, type Graph, type Node } from "../graph/types";
import { BinaryHeap } from "./heap";

export type ConstrainedRoute = { path: number[]; lengthMeters: number };

/** One entry waiting in the priority queue: a node with its known f = g + h. */
type Frontier = { id: number; g: number; f: number };

function nodeIndex(graph: Graph): Map<number, Node> {
  const byId = new Map<number, Node>();
  for (const n of graph.nodes) byId.set(n.id, n);
  return byId;
}

/**
 * Shortest bearing-LEGAL path from `startId` to `endId` by road length. Runs A* but only
 * relaxes an out-edge whose bearing is within 90° of the current node's bearing to the
 * destination (recomputed fresh at each expanded node, since it changes as you move).
 * Returns the node-id path and total length, or null if the open set empties without
 * settling the destination (bearing-unreachable), or if an endpoint is absent.
 *
 * Stages 3–4 wrap this with captured exploration and the typed failure taxonomy; here it
 * returns only the path + length.
 */
export function findConstrainedRoute(
  graph: Graph,
  startId: number,
  endId: number,
): ConstrainedRoute | null {
  const byId = nodeIndex(graph);
  const start = byId.get(startId);
  const end = byId.get(endId);
  if (!start || !end) return null;

  if (startId === endId) return { path: [startId], lengthMeters: 0 };

  const h = (id: number): number => haversineMeters(byId.get(id)!, end);

  const gScore = new Map<number, number>([[startId, 0]]);
  const cameFrom = new Map<number, number>();

  // Smaller f first; ties broken by smaller node id — deterministic, no randomness/time.
  const open = new BinaryHeap<Frontier>((a, b) =>
    a.f !== b.f ? a.f < b.f : a.id < b.id,
  );
  open.push({ id: startId, g: 0, f: h(startId) });

  while (open.size > 0) {
    const current = open.pop()!;
    if (current.g > (gScore.get(current.id) ?? Infinity)) continue; // stale entry

    if (current.id === endId) {
      return { path: reconstruct(cameFrom, endId), lengthMeters: current.g };
    }

    // Bearing from THIS node to the destination — fresh per expanded node.
    const bearingToDest = initialBearingDeg(byId.get(current.id)!, end);

    for (const edge of outEdges(graph, current.id)) {
      if (!isBearingLegal(edge.bearingDeg, bearingToDest)) continue; // the constraint
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
