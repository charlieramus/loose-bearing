// Snapping (V4, Stage 3): a coordinate → the nearest routable graph node, using V2's spatial
// grid (`nearest`) unchanged. If the closest node is farther than the snap radius, the point
// is genuinely OFF the street network (a reservoir, a rooftop interior, open prairie) — that
// is the OffNetwork state, NOT a routing failure, and it must be distinguished here before we
// ever call the router.

import { nearest, type Grid } from "../../build/spatial";
import type { LatLng } from "../geo/geo";

/**
 * Beyond this distance from the nearest node we treat the point as off-network. ~400 m is
 * comfortably past the grid's ~330 m cell (a real street point almost always snaps within one
 * cell) yet tight enough that the middle of a reservoir or a large park does not spuriously
 * grab a shoreline road.
 */
export const SNAP_RADIUS_METERS = 400;

export type SnapHit = { ok: true; nodeId: number; meters: number; coord: LatLng };
export type SnapMiss = { ok: false };
export type SnapResult = SnapHit | SnapMiss;

/** Nearest routable node to `p`, or a miss if nothing is within `radius` meters. */
export function snapToNode(
  grid: Grid,
  p: LatLng,
  radius: number = SNAP_RADIUS_METERS,
): SnapResult {
  const hit = nearest(grid, p);
  if (!hit || hit.meters > radius) return { ok: false };
  const node = grid.nodes[hit.id];
  return { ok: true, nodeId: hit.id, meters: hit.meters, coord: { lat: node.lat, lng: node.lng } };
}
