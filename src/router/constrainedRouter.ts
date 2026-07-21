// The constrained router — A* that obeys the 90° bearing rule (THE product idea). It is
// the Stage 1 search with one change: when expanding a node, an out-edge is only relaxed
// if it is bearing-legal toward the destination. Legality of edge (u → v) depends solely
// on u's position and the fixed destination (never on how u was reached), so the rule just
// removes edges from a static subgraph — A* stays optimal and its haversine heuristic stays
// admissible (removing edges never shortens a remaining path). The angle math is imported
// from the V1 geo core and the ONE predicate in bearingRule; it is never reimplemented here.
//
// One core search, `runSearch`, does the pathfinding; both the plain `findConstrainedRoute`
// and the capturing `findConstrainedRouteWithExploration` call it, so the algorithm — and
// therefore the settle order and result — is single-sourced and cannot drift between them.
// Capture only OBSERVES the search; it never changes which edges are relaxed.

import { haversineMeters, initialBearingDeg } from "../geo/geo";
import { isBearingLegal } from "../geo/bearingRule";
import { outEdges, type Graph, type Node } from "../graph/types";
import { BinaryHeap } from "./heap";

export type ConstrainedRoute = { path: number[]; lengthMeters: number };

/** An out-edge the search skipped because it failed the bearing rule at its from-node. */
export type RejectedEdge = { from: number; to: number; bearingDeg: number };

/**
 * The captured scratch work of one constrained search — the raw material V5 animates and
 * the search-stats readout reports. Detail is bounded (see `MAX_REJECTED_DETAIL`): an
 * unreachable search explores the entire reachable-under-rule region, so per-edge rejected
 * DETAIL is capped while TOTAL counts keep accumulating, and `rejectedDetailCapped` records
 * whether thinning occurred. Settled nodes and the frontier are each inherently bounded by
 * the node count (every node settles at most once), so they are kept in full.
 */
export type Exploration = {
  /** Node ids in the order they were settled (popped with best-known g and expanded). */
  settledOrder: number[];
  /** Per expanded node, the out-edges rejected for failing the bearing rule (capped). */
  rejectedByNode: Map<number, RejectedEdge[]>;
  /** Total rejected edges observed across the whole search (never thinned). */
  rejectedTotalCount: number;
  /** Rejected edges actually stored as detail (≤ MAX_REJECTED_DETAIL). */
  rejectedDetailCount: number;
  /** True if the detail cap was reached and later rejected edges were counted-only. */
  rejectedDetailCapped: boolean;
  /** Distinct unsettled node ids still in the open set when the search terminated. */
  frontier: number[];
};

export type ConstrainedSearchResult = {
  result: ConstrainedRoute | null;
  exploration: Exploration;
};

/**
 * Documented cap on stored rejected-edge DETAIL. Past this many rejected edges the search
 * still counts every rejection (`rejectedTotalCount`) but stops storing per-edge objects,
 * so memory stays bounded even on a maximally-exploring unreachable search over the real
 * 3.6M-edge graph. Settle order and frontier are bounded by node count and kept in full.
 */
export const MAX_REJECTED_DETAIL = 50_000;

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
 */
export function findConstrainedRoute(
  graph: Graph,
  startId: number,
  endId: number,
): ConstrainedRoute | null {
  return runSearch(graph, startId, endId, null);
}

/**
 * Same search as `findConstrainedRoute`, but also returns the captured `Exploration`
 * (settle order, per-node rejected edges, and the terminating frontier). The pathfinding
 * is identical — capture only observes it (Stage 3).
 */
export function findConstrainedRouteWithExploration(
  graph: Graph,
  startId: number,
  endId: number,
): ConstrainedSearchResult {
  const exploration: Exploration = {
    settledOrder: [],
    rejectedByNode: new Map(),
    rejectedTotalCount: 0,
    rejectedDetailCount: 0,
    rejectedDetailCapped: false,
    frontier: [],
  };
  const result = runSearch(graph, startId, endId, exploration);
  return { result, exploration };
}

/**
 * The single constrained-A* core. When `capture` is non-null the search records its
 * scratch work into it without altering any relaxation decision.
 */
function runSearch(
  graph: Graph,
  startId: number,
  endId: number,
  capture: Exploration | null,
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
      if (capture) captureFrontier(capture, open);
      return { path: reconstruct(cameFrom, endId), lengthMeters: current.g };
    }

    if (capture) capture.settledOrder.push(current.id);

    // Bearing from THIS node to the destination — fresh per expanded node.
    const bearingToDest = initialBearingDeg(byId.get(current.id)!, end);

    for (const edge of outEdges(graph, current.id)) {
      if (!isBearingLegal(edge.bearingDeg, bearingToDest)) {
        if (capture) recordRejected(capture, current.id, edge);
        continue; // the constraint
      }
      const tentativeG = current.g + edge.lengthMeters;
      if (tentativeG < (gScore.get(edge.to) ?? Infinity)) {
        gScore.set(edge.to, tentativeG);
        cameFrom.set(edge.to, current.id);
        open.push({ id: edge.to, g: tentativeG, f: tentativeG + h(edge.to) });
      }
    }
  }

  if (capture) captureFrontier(capture, open); // empty on an exhausted search
  return null;
}

/** Record one rejected out-edge, respecting the detail cap (totals always accumulate). */
function recordRejected(capture: Exploration, from: number, edge: { to: number; bearingDeg: number }): void {
  capture.rejectedTotalCount++;
  if (capture.rejectedDetailCount >= MAX_REJECTED_DETAIL) {
    capture.rejectedDetailCapped = true;
    return;
  }
  let list = capture.rejectedByNode.get(from);
  if (!list) {
    list = [];
    capture.rejectedByNode.set(from, list);
  }
  list.push({ from, to: edge.to, bearingDeg: edge.bearingDeg });
  capture.rejectedDetailCount++;
}

/** Snapshot the distinct unsettled node ids remaining in the open set at termination. */
function captureFrontier(capture: Exploration, open: BinaryHeap<Frontier>): void {
  const settled = new Set(capture.settledOrder);
  const seen = new Set<number>();
  for (const entry of open.snapshot()) {
    if (!settled.has(entry.id) && !seen.has(entry.id)) {
      seen.add(entry.id);
      capture.frontier.push(entry.id);
    }
  }
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
