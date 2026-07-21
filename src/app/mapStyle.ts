// Map style + view configuration for the instrument's framed "screen".
//
// Style source: CARTO's free/OSS basemaps (no API key) — Positron for light, Dark Matter
// for dark. They are already the quiet monochrome map the reference artifact wants
// (concrete/ink ground, thin grey streets, restrained labels), so we adopt them and then
// nudge a couple of paint colors toward the instrument's concrete/ink tokens so the map
// reads as one surface with the shell. OSM data © OpenStreetMap contributors; basemap
// © CARTO — both surface in the attribution control we keep visible.

import type { Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import { FRONT_RANGE_BBOX } from "../geo/region";

export type Theme = "light" | "dark";

/** CARTO OSS vector styles — quiet monochrome, no key required. */
export const STYLE_URL: Record<Theme, string> = {
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
};

/** Instrument ground/ink tones the map is tinted toward, per theme (matches styles.css). */
const GROUND: Record<Theme, { ground: string; water: string }> = {
  light: { ground: "#f3f3f5", water: "#e7e8ec" },
  dark: { ground: "#131316", water: "#1b1c20" },
};

/**
 * Signal palette for on-map drawing (route line, direct line, fault). MapLibre paint needs
 * literal colors, so these mirror the CSS custom properties in styles.css per theme — the ONE
 * green accent, red for faults only, ink for the neutral direct line.
 */
export const PALETTE: Record<Theme, { signal: string; fault: string; ink: string; ground: string }> = {
  light: { signal: "#16a34a", fault: "#dc2626", ink: "#17181b", ground: "#f3f3f5" },
  dark: { signal: "#34d399", fault: "#f0595d", ink: "#e9eaee", ground: "#131316" },
};

/** Front Range default camera — centered on the clip window, zoomed to show the corridor. */
export const FRONT_RANGE_VIEW = {
  center: [
    (FRONT_RANGE_BBOX.minLng + FRONT_RANGE_BBOX.maxLng) / 2,
    (FRONT_RANGE_BBOX.minLat + FRONT_RANGE_BBOX.maxLat) / 2,
  ] as [number, number],
  zoom: 7.4,
};

/** Max bounds a touch looser than the clip window, so the corridor can't be panned away. */
export const FRONT_RANGE_MAX_BOUNDS: [[number, number], [number, number]] = [
  [FRONT_RANGE_BBOX.minLng - 0.6, FRONT_RANGE_BBOX.minLat - 0.4],
  [FRONT_RANGE_BBOX.maxLng + 0.6, FRONT_RANGE_BBOX.maxLat + 0.4],
];

/**
 * Nudge the loaded CARTO style toward the instrument ground/ink. Defensive: every layer
 * lookup is optional, so a style revision that renames a layer degrades to the stock look
 * rather than throwing. Called after each style load (initial + theme swap).
 */
export function applyInstrumentTint(map: MapLibreMap, theme: Theme): void {
  const tones = GROUND[theme];
  const style = map.getStyle() as StyleSpecification | undefined;
  if (!style?.layers) return;
  for (const layer of style.layers) {
    try {
      if (layer.type === "background") {
        map.setPaintProperty(layer.id, "background-color", tones.ground);
      } else if (/water/.test(layer.id) && layer.type === "fill") {
        map.setPaintProperty(layer.id, "fill-color", tones.water);
      }
    } catch {
      // Layer not paintable / removed by a style revision — ignore, keep the stock paint.
    }
  }
}
