// Route → render plan (V4, Stage 5). A PURE function of the router result: it turns a
// `RouteResult` (plus the two resolved endpoints) into a `RenderPlan` of plain coordinates,
// with no MapLibre dependency. Keeping this pure is deliberate — Stage 5's map renderer, the
// permalink reproduction (Stage 7), and V5's animated reveal all consume the same plan, and it
// is unit-testable without a browser.
//
// Success  → a green route line along the constrained path.
// Fault    → NO through-line. NoBearingLegalPath draws a red STUB from the origin to the trap
//            (the deepest node the search settled — where it dead-ended) plus a red box at that
//            trap; Disconnected has no exploration, so it marks the unreachable destination.
// Otherwise (off-network / other) → nothing to draw on the map.

import type { Graph } from "../graph/types";
import type { LatLng } from "../geo/geo";
import type { RouteResult } from "../router";
import type { ResolvedEndpoint } from "./resolve";

/** MapLibre coordinate order: [lng, lat]. */
export type LngLat = [number, number];

export type RenderPlan =
  | { kind: "route"; line: LngLat[] }
  | { kind: "fault"; stub: LngLat[] | null; trap: LatLng | null }
  | { kind: "none" };

function nodeLatLng(graph: Graph, id: number): LatLng | null {
  const n = graph.nodes[id];
  return n ? { lat: n.lat, lng: n.lng } : null;
}

/** Map a node-id path to a [lng, lat] polyline, skipping any unknown ids defensively. */
export function pathToLngLat(graph: Graph, path: number[]): LngLat[] {
  const out: LngLat[] = [];
  for (const id of path) {
    const n = graph.nodes[id];
    if (n) out.push([n.lng, n.lat]);
  }
  return out;
}

/** Pure result → render plan. Never draws a fake through-line on a fault. */
export function planFromResult(
  graph: Graph,
  result: RouteResult,
  origin: ResolvedEndpoint,
  dest: ResolvedEndpoint,
): RenderPlan {
  if (result.kind === "success") {
    return { kind: "route", line: pathToLngLat(graph, result.path) };
  }

  switch (result.reason) {
    case "NoBearingLegalPath": {
      // The trap = the deepest node the constrained search settled before stalling.
      const trapId = result.exploration?.settledOrder.at(-1);
      const trap = trapId != null ? nodeLatLng(graph, trapId) : null;
      const stub: LngLat[] | null = trap
        ? [
            [origin.coord.lng, origin.coord.lat],
            [trap.lng, trap.lat],
          ]
        : null;
      return { kind: "fault", stub, trap };
    }
    case "Disconnected":
      // No constrained exploration was captured (ordinary routing already failed); mark the
      // unreachable destination rather than inventing a trap.
      return { kind: "fault", stub: null, trap: dest.coord };
    default:
      return { kind: "none" };
  }
}
