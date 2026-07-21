// The region definition — the single source of truth for WHERE Loose Bearing operates, shared
// by BOTH the offline build pipeline (build/config re-exports it) and the running app (map view,
// geocode biasing, permalink clamping). Lifted here in V4/Stage 7 so the bbox is not duplicated
// between the build and the app.

import type { LatLng } from "./geo";

/** An axis-aligned lat/lng bounding box in decimal degrees (WGS84). */
export type BBox = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

/**
 * The Front Range clip window — the urban corridor where the Great Plains meet the foothills of
 * the Southern Rockies: Fort Collins in the north through Loveland, Longmont, Boulder, Denver,
 * and Colorado Springs to Pueblo in the south. minLng -105.35 is the foothills/mountain seam;
 * maxLng -104.60 is a short way east of the I-25 corridor. This bounds the offline OSM clip AND
 * clamps permalink coordinates in the app — one definition, both consumers.
 */
export const FRONT_RANGE_BBOX: BBox = {
  minLat: 38.2,
  maxLat: 40.65,
  minLng: -105.35,
  maxLng: -104.6,
};

/** True iff a coordinate falls inside `bbox` (inclusive edges). */
export function inBBox(lat: number, lng: number, bbox: BBox = FRONT_RANGE_BBOX): boolean {
  return lat >= bbox.minLat && lat <= bbox.maxLat && lng >= bbox.minLng && lng <= bbox.maxLng;
}

/** Clamp a coordinate into `bbox` (each axis independently). */
export function clampToBBox(lat: number, lng: number, bbox: BBox = FRONT_RANGE_BBOX): LatLng {
  return {
    lat: Math.min(bbox.maxLat, Math.max(bbox.minLat, lat)),
    lng: Math.min(bbox.maxLng, Math.max(bbox.minLng, lng)),
  };
}
