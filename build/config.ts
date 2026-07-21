// Shared configuration for the offline OSM → graph pipeline (build/01…06).
// This file is the single source of truth for WHERE the region is and WHAT counts as a
// routable street. Retargeting the pipeline to another region is a one-line bbox edit here
// plus a rerun — nothing downstream is hand-edited.

/** An axis-aligned lat/lng bounding box in decimal degrees (WGS84). */
export type BBox = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

/**
 * The Front Range clip window.
 *
 * The Colorado Front Range is the urban corridor where the Great Plains meet the foothills
 * of the Southern Rockies — Fort Collins in the north down through Loveland, Longmont,
 * Boulder, Denver, and Colorado Springs to Pueblo in the south. We clip a rectangle that
 * covers that corridor and nothing else (no Western Slope, no eastern plains sprawl):
 *
 *  - minLat 38.20  — just south of Pueblo (~38.25 N).
 *  - maxLat 40.65  — just north of Fort Collins (~40.58 N).
 *  - minLng -105.35 — the foothills / mountain seam west of Boulder & Fort Collins, where
 *                     the graded street grid gives way to canyon roads. West of this the
 *                     network is sparse and not "Front Range streets".
 *  - maxLng -104.60 — the plains a short way east of the I-25 corridor (I-25 runs roughly
 *                     -104.8…-105.0 through the metros). Far enough east to include the
 *                     eastern suburbs, not so far as to drag in empty prairie.
 *
 * This same constant is reused in V4 to clamp permalink coordinates into the region, so it
 * is exported cleanly and must stay the authoritative definition of "the map".
 */
export const FRONT_RANGE_BBOX: BBox = {
  minLat: 38.2,
  maxLat: 40.65,
  minLng: -105.35,
  maxLng: -104.6,
};

/** True iff a coordinate falls inside the Front Range clip window (inclusive edges). */
export function inBBox(lat: number, lng: number, bbox: BBox = FRONT_RANGE_BBOX): boolean {
  return (
    lat >= bbox.minLat &&
    lat <= bbox.maxLat &&
    lng >= bbox.minLng &&
    lng <= bbox.maxLng
  );
}

/** Source extract (Geofabrik Colorado). Redirects to the current dated snapshot. */
export const COLORADO_EXTRACT_URL =
  "https://download.geofabrik.de/north-america/us/colorado-latest.osm.pbf";

/** Where the pipeline keeps its data. */
export const DATA_DIR = "build/data";
export const COLORADO_PBF = `${DATA_DIR}/colorado-latest.osm.pbf`;
export const FILTERED_JSON = `${DATA_DIR}/filtered.json`;

/**
 * Routable highway classes we keep. Drivable/walkable public ways only; everything else
 * (waterways, boundaries, buildings, tracks, raceways, construction, …) is dropped at
 * filter time to keep the artifact small. We include the standard road hierarchy plus their
 * `_link` ramps, plus the walkable classes so the network stays connected across
 * pedestrianized blocks. No `track`/`bridleway`/`cycleway` — those are not the street grid
 * the game routes on.
 */
export const KEPT_HIGHWAY_CLASSES: ReadonlySet<string> = new Set([
  "motorway",
  "motorway_link",
  "trunk",
  "trunk_link",
  "primary",
  "primary_link",
  "secondary",
  "secondary_link",
  "tertiary",
  "tertiary_link",
  "unclassified",
  "residential",
  "living_street",
  "service",
  "pedestrian",
  "footway",
  "path",
]);
