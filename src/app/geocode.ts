// Geocoding (V4, Stage 3): human text → a coordinate. Kept behind a small `Geocoder`
// interface so the provider is swappable (Nominatim for dev; a paid/self-hosted geocoder
// later) and so the resolve pipeline is testable without the network. A no-match returns the
// `GeocodeMiss` state — the one taxonomy state that happens BEFORE we have graph node ids
// (V3 reserved it out of the search-time union for exactly this reason).
//
// Nominatim usage policy: callers debounce input to ≤ 1 req/sec (see DEBOUNCE_MS) and we bias
// results to the Front Range via a bounded viewbox so a bare "Main St" resolves in-region.
// Attribution (OSM / Nominatim) is exposed for the UI to surface.

import { FRONT_RANGE_BBOX } from "../geo/region";

export type GeocodeHit = { kind: "hit"; lat: number; lng: number; label: string };
export type GeocodeResult = GeocodeHit | { kind: "miss" };

export interface Geocoder {
  geocode(query: string, signal?: AbortSignal): Promise<GeocodeResult>;
}

/** Nominatim asks for ≥ 1s between requests; the input debounce honors that. */
export const DEBOUNCE_MS = 1000;

export const GEOCODER_ATTRIBUTION = "Geocoding © OpenStreetMap / Nominatim";

/** Raw Nominatim search row (only the fields we read). */
type NominatimRow = { lat: string; lon: string; display_name: string };

/**
 * Nominatim-backed geocoder, biased (bounded) to the Front Range clip window so queries
 * resolve in-region. Empty input short-circuits to a miss without a network call. Any HTTP
 * error surfaces as a thrown error (the caller decides how to present a transient failure);
 * a well-formed empty result set is a clean `miss`.
 */
export class NominatimGeocoder implements Geocoder {
  constructor(
    private readonly endpoint = "https://nominatim.openstreetmap.org/search",
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async geocode(query: string, signal?: AbortSignal): Promise<GeocodeResult> {
    const q = query.trim();
    if (q.length === 0) return { kind: "miss" };

    const b = FRONT_RANGE_BBOX;
    const params = new URLSearchParams({
      q,
      format: "jsonv2",
      limit: "1",
      // viewbox = left,top,right,bottom (lng,lat,lng,lat); bounded=1 restricts to it.
      viewbox: `${b.minLng},${b.maxLat},${b.maxLng},${b.minLat}`,
      bounded: "1",
    });

    const res = await this.fetchImpl(`${this.endpoint}?${params.toString()}`, {
      signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`geocoder HTTP ${res.status}`);
    const rows = (await res.json()) as NominatimRow[];
    if (!Array.isArray(rows) || rows.length === 0) return { kind: "miss" };

    const row = rows[0];
    const lat = Number.parseFloat(row.lat);
    const lng = Number.parseFloat(row.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { kind: "miss" };
    return { kind: "hit", lat, lng, label: row.display_name };
  }
}
