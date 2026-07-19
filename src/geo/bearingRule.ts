// THE rule — the one function that defines what makes a turn legal in Loose Bearing.
// Everything downstream (the router in V3, the reveal in V5) imports this and NEVER
// reimplements the 90° comparison. It is the single idea the whole product rests on.

import { angularDiffDeg } from "./geo";

/**
 * A turn is legal iff the edge's bearing is within 90° (INCLUSIVE) of the bearing from
 * the current node to the destination.
 *
 * Inclusivity of exactly 90° is intentional: a perpendicular turn — one that neither
 * gains nor loses ground toward the destination — is allowed. Only turns that point back
 * toward where you came from (more than 90° off the direct bearing) are illegal.
 *
 * The default epsilon is a tiny slack (1e-9°) so that EXACTLY 90° stays legal and float
 * noise at the boundary is deterministic rather than flapping.
 *
 * @param edgeBearingDeg     compass bearing of the candidate edge, degrees
 * @param bearingToDestDeg   compass bearing from the current node to the destination, degrees
 */
export function isBearingLegal(
  edgeBearingDeg: number,
  bearingToDestDeg: number,
  opts?: { epsilonDeg?: number },
): boolean {
  const epsilon = opts?.epsilonDeg ?? 1e-9;
  return angularDiffDeg(edgeBearingDeg, bearingToDestDeg) <= 90 + epsilon;
}
