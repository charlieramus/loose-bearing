// Shared configuration for the offline OSM → graph pipeline (build/01…06).
// This file is the single source of truth for WHAT counts as a routable street. WHERE the
// region is now lives in the shared `src/geo/region` module (so the app and the build agree on
// one bbox); it is re-exported here so the build scripts keep importing it from `./config`.

export { FRONT_RANGE_BBOX, inBBox, clampToBBox } from "../src/geo/region";
export type { BBox } from "../src/geo/region";

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
