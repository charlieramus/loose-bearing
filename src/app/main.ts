// App entry (V4). Builds the instrument shell and mounts a MapLibre map into the framed
// screen, centered on the Front Range, in the reference artifact's quiet monochrome. Later
// stages wire the graph loader, geocoding, pins, the router, the readout panel, and
// permalinks into the regions the shell exposes. No routing happens yet.

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";

import { buildShell } from "./shell";
import { applyTheme, initialTheme, otherTheme } from "./theme";
import {
  applyInstrumentTint,
  FRONT_RANGE_MAX_BOUNDS,
  FRONT_RANGE_VIEW,
  STYLE_URL,
  type Theme,
} from "./mapStyle";

const mount = document.querySelector<HTMLDivElement>("#app");
if (!mount) throw new Error("missing #app mount");

const refs = buildShell(mount);

let theme: Theme = initialTheme();
applyTheme(refs.root, theme);

const map = new maplibregl.Map({
  container: refs.mapContainer,
  style: STYLE_URL[theme],
  center: FRONT_RANGE_VIEW.center,
  zoom: FRONT_RANGE_VIEW.zoom,
  maxBounds: FRONT_RANGE_MAX_BOUNDS,
  attributionControl: { compact: true },
  // The quiet instrument look wants a flat, north-up screen — no tilt/rotate gestures.
  pitchWithRotate: false,
  dragRotate: false,
});
map.touchZoomRotate.disableRotation();
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

// Re-tint on every style load — the initial load and every theme swap both fire this.
map.on("style.load", () => applyInstrumentTint(map, theme));

// Theme toggle: swap the CARTO style and re-stamp the shell attribute.
refs.themeButton.addEventListener("click", () => {
  theme = otherTheme(theme);
  applyTheme(refs.root, theme);
  map.setStyle(STYLE_URL[theme]);
});

// Expose for later stages / debugging without a global type leak.
(window as unknown as { __lbMap?: maplibregl.Map }).__lbMap = map;
