// The typed route result — the router's public contract. Every outcome is a named,
// distinguishable value so that "unreachable is a feature" (NoBearingLegalPath) is NEVER
// conflated with an ordinary error. This is the discriminated union V4/V5 switch on.
//
// The five failure reasons (agreed in the CEO review, decision D4):
//   OriginOffNetwork       — the start node id is absent from the graph.
//   DestinationOffNetwork  — the end node id is absent from the graph.
//   Disconnected           — the destination is unreachable even by ORDINARY (unconstrained)
//                            routing: no path exists regardless of the bearing rule.
//   NoBearingLegalPath     — THE feature: an ordinary path exists, but the 90° rule blocks
//                            every route. Returned ONLY when unconstrained routing succeeds.
//   GraphLoadError         — the artifact failed to load. Raised by the LOADER, not the
//                            search; the reason name is reserved here so all five live in
//                            one place. `route()` below never returns it.
//
// NOTE (reserved for V4): a `GeocodeMiss` will occur BEFORE we have node ids — when a typed
// address does not resolve to a snappable point — so it is a V4/geocoding concern, not a
// search-time state, and is intentionally NOT part of this search-time union.

import { shortestPath } from "./astar";
import {
  findConstrainedRouteWithExploration,
  type Exploration,
} from "./constrainedRouter";
import type { Graph } from "../graph/types";

export type FailureReason =
  | "OriginOffNetwork"
  | "DestinationOffNetwork"
  | "NoBearingLegalPath"
  | "Disconnected"
  | "GraphLoadError";

/** A found bearing-legal route, with the captured exploration V5 animates. */
export type Success = {
  kind: "success";
  path: number[];
  lengthMeters: number;
  /**
   * How much longer the constrained route is than the ordinary shortest path:
   * `constrainedLength / unconstrainedLength`. 1.0 means the rule did not bind; larger
   * means the bearing rule forced a detour. Exactly 1.0 for a trivial (start === end) route.
   */
  detourFactor: number;
  exploration: Exploration;
};

/** A named non-result. `NoBearingLegalPath` still carries the (maximal) exploration. */
export type Failure = {
  kind: "failure";
  reason: FailureReason;
  exploration?: Exploration;
};

export type RouteResult = Success | Failure;

/** True iff `id` exists in the graph's adjacency (has an out-edge list, possibly empty). */
function hasNode(graph: Graph, id: number): boolean {
  return graph.adjacency.has(id) || graph.nodes.some((n) => n.id === id);
}

/**
 * Route from `startId` to `endId` under the 90° bearing rule, returning a typed result.
 * Distinguishes, in order: origin missing → `OriginOffNetwork`; destination missing →
 * `DestinationOffNetwork`; unreachable even unconstrained → `Disconnected`; reachable
 * unconstrained but the constrained search exhausts → `NoBearingLegalPath`; otherwise a
 * `Success`. The ordering guarantees `NoBearingLegalPath` is returned ONLY when an ordinary
 * path genuinely exists — protecting the feature from ordinary connectivity errors.
 */
export function route(graph: Graph, startId: number, endId: number): RouteResult {
  if (!hasNode(graph, startId)) return { kind: "failure", reason: "OriginOffNetwork" };
  if (!hasNode(graph, endId)) return { kind: "failure", reason: "DestinationOffNetwork" };

  // An ordinary (rule-free) path must exist first; if not, this is plain disconnection,
  // NOT the bearing feature. We keep its length for an honest detour ratio (same graph,
  // same endpoints, shortest-constrained ÷ shortest-unconstrained).
  const unconstrained = shortestPath(graph, startId, endId);
  if (unconstrained === null) {
    return { kind: "failure", reason: "Disconnected" };
  }

  const { result, exploration } = findConstrainedRouteWithExploration(graph, startId, endId);
  if (result === null) {
    // Ordinary path exists (checked above) but the rule blocks every route — the feature.
    return { kind: "failure", reason: "NoBearingLegalPath", exploration };
  }

  // Detour factor = constrained ÷ unconstrained length. When the unconstrained path is
  // ~0 (origin == dest) the ratio is undefined, so report 1.0 (no detour).
  const detourFactor =
    unconstrained.lengthMeters < 1e-9
      ? 1
      : result.lengthMeters / unconstrained.lengthMeters;

  return {
    kind: "success",
    path: result.path,
    lengthMeters: result.lengthMeters,
    detourFactor,
    exploration,
  };
}
