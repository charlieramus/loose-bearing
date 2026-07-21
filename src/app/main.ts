// App entry (V4). Builds the instrument shell, mounts the MapLibre map over the Front Range in
// the reference artifact's quiet monochrome, loads V2's graph client-side, and hands the
// running shell + map to the AppController which owns endpoints, pins, and the query lifecycle.

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
import { ScreenOverlay } from "./overlay";
import { loadGraph, type LoadedGraph } from "./graphLoader";
import { AppController } from "./controller";
import { readPermalink } from "./permalink";

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

const controller = new AppController(refs, map, theme);

// Theme toggle: swap the CARTO style, re-stamp the shell attribute, and recolor drawn geometry.
refs.themeButton.addEventListener("click", () => {
  theme = otherTheme(theme);
  applyTheme(refs.root, theme);
  controller.setTheme(theme);
  map.setStyle(STYLE_URL[theme]);
});

// ---- Graph load (Stage 2) ------------------------------------------------
// Load V2's artifact client-side (recorded strategy), showing a LOADING indicator and, on any
// failure, the blocking GraphLoadError state with a RETRY. On success the controller gets the
// graph + snapping grid and endpoints become resolvable.
const overlay = new ScreenOverlay(refs.screen);
let loaded: LoadedGraph | null = null;

async function initGraph(): Promise<void> {
  overlay.showLoading("LOADING GRAPH", "Front Range street network");
  refs.headerStatus.textContent = "LOADING…";
  refs.headerStatus.dataset.fault = "false";
  const outcome = await loadGraph();
  if (outcome.ok) {
    loaded = outcome.data;
    const { nodeCount, edgeCount } = outcome.data.meta;
    // Verify hook: counts should match V2 (1,426,625 nodes / 3,631,737 edges).
    console.info(`[loose-bearing] graph loaded: ${nodeCount} nodes / ${edgeCount} edges`);
    refs.graphReadout.textContent = `${(nodeCount / 1e6).toFixed(2)}M N · ${(edgeCount / 1e6).toFixed(2)}M E`;
    refs.headerStatus.textContent = "READY";
    overlay.hide();
    controller.setGraph(outcome.data);
    // If the URL carries a valid (clamped) permalink, reproduce that route deterministically.
    const pair = readPermalink();
    if (pair) controller.loadPermalink(pair);
  } else {
    loaded = null;
    console.error(`[loose-bearing] GraphLoadError: ${outcome.detail}`);
    refs.headerStatus.textContent = "GRAPH LOAD ERROR";
    refs.headerStatus.dataset.fault = "true";
    overlay.showFault("GRAPH LOAD ERROR", outcome.detail, [
      { label: "RETRY", onClick: () => void initGraph() },
    ]);
  }
}

void initGraph();

// Expose for later stages / debugging without a global type leak.
(window as unknown as { __lbMap?: maplibregl.Map; __lbGraph?: () => LoadedGraph | null }).__lbMap =
  map;
(window as unknown as { __lbGraph?: () => LoadedGraph | null }).__lbGraph = () => loaded;
