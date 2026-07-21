// The bearing-constrained router — public surface (V3). V4/V5 import from here.
//
// `route()` is the headline entry point: a pure, deterministic function of
// (graph, startId, endId) returning a five-state typed `RouteResult` — a `Success`
// (shortest bearing-legal path + length + detour factor + captured exploration) or a named
// `Failure` (OriginOffNetwork | DestinationOffNetwork | NoBearingLegalPath | Disconnected |
// GraphLoadError). The lower-level searches are exported for direct/testing use.

export { route } from "./result";
export type { RouteResult, Success, Failure, FailureReason } from "./result";

export { shortestPath } from "./astar";
export type { ShortestPath } from "./astar";

export {
  findConstrainedRoute,
  findConstrainedRouteWithExploration,
  MAX_REJECTED_DETAIL,
} from "./constrainedRouter";
export type {
  ConstrainedRoute,
  ConstrainedSearchResult,
  Exploration,
  RejectedEdge,
} from "./constrainedRouter";
