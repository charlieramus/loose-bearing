// Shared spherical-geometry core — the single source of truth for all distance and
// bearing math in Loose Bearing. Pure functions only: no side effects, no Math.random,
// no Date. Every downstream module (the bearing rule, the router, the graph builder)
// imports its geometry from here and never reimplements it.

/** A WGS84 coordinate in decimal degrees. */
export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_METERS = 6_371_008.8; // IUGG mean Earth radius

const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

/**
 * Great-circle (haversine) distance between two points, in meters.
 */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Initial great-circle bearing from `a` to `b`, in compass degrees normalized to
 * [0, 360): 0 = due north, 90 = due east, 180 = due south, 270 = due west.
 */
export function initialBearingDeg(a: LatLng, b: LatLng): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  const bearing = toDeg(Math.atan2(y, x));
  return ((bearing % 360) + 360) % 360;
}

/**
 * Smallest absolute difference between two compass bearings, in [0, 180].
 * Handles 0/360 wraparound (e.g. 350° vs 20° → 30°).
 */
export function angularDiffDeg(from: number, to: number): number {
  const raw = Math.abs(((from - to) % 360 + 360) % 360);
  return raw > 180 ? 360 - raw : raw;
}
