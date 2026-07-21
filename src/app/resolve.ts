// Endpoint resolution (V4, Stage 3): turn a user's intent for A or B into a snapped graph
// node id, honestly reporting which failure state occurred. Two entry points share the
// snap-and-classify tail:
//   - `resolveQuery`  — text → geocode → snap  (the control inputs)
//   - `resolveCoord`  — a map coordinate → snap (map clicks / dragged pins, Stage 4)
// The role (origin vs dest) selects the correct OffNetwork variant so the five-state taxonomy
// stays exact. `GeocodeMiss` can only come from the text path (there's no geocode for a click).

import type { Grid } from "../../build/spatial";
import type { LatLng } from "../geo/geo";
import type { Geocoder } from "./geocode";
import { snapToNode } from "./snap";

export type EndpointRole = "origin" | "dest";

export type ResolvedEndpoint = {
  role: EndpointRole;
  nodeId: number;
  coord: LatLng; // the SNAPPED node coordinate (what the router uses / we render)
  input: LatLng; // the raw geocoded/clicked coordinate, for reference
  label: string;
  snapMeters: number;
};

/** A resolution failure, named as one of the taxonomy's pre-route states. */
export type ResolveFailureState =
  | "GeocodeMiss"
  | "OriginOffNetwork"
  | "DestinationOffNetwork";

export type ResolveOutcome =
  | { ok: true; endpoint: ResolvedEndpoint }
  | { ok: false; state: ResolveFailureState };

const offNetworkFor = (role: EndpointRole): ResolveFailureState =>
  role === "origin" ? "OriginOffNetwork" : "DestinationOffNetwork";

/** Snap an already-known coordinate and classify (shared tail of both entry points). */
function snapEndpoint(
  role: EndpointRole,
  input: LatLng,
  label: string,
  grid: Grid,
): ResolveOutcome {
  const snap = snapToNode(grid, input);
  if (!snap.ok) return { ok: false, state: offNetworkFor(role) };
  return {
    ok: true,
    endpoint: {
      role,
      nodeId: snap.nodeId,
      coord: snap.coord,
      input,
      label,
      snapMeters: snap.meters,
    },
  };
}

/** Text → coordinate (geocode) → snapped node. A no-match is `GeocodeMiss`. */
export async function resolveQuery(
  query: string,
  role: EndpointRole,
  geocoder: Geocoder,
  grid: Grid,
  signal?: AbortSignal,
): Promise<ResolveOutcome> {
  const geo = await geocoder.geocode(query, signal);
  if (geo.kind === "miss") return { ok: false, state: "GeocodeMiss" };
  return snapEndpoint(role, { lat: geo.lat, lng: geo.lng }, geo.label, grid);
}

/** A map coordinate → snapped node (no geocoding, so never `GeocodeMiss`). Stage 4. */
export function resolveCoord(coord: LatLng, role: EndpointRole, grid: Grid): ResolveOutcome {
  const label = `${coord.lat.toFixed(5)}, ${coord.lng.toFixed(5)}`;
  return snapEndpoint(role, coord, label, grid);
}
