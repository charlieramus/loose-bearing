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
import { ScreenOverlay } from "./overlay";
import { loadGraph, type LoadedGraph } from "./graphLoader";
import { NominatimGeocoder, DEBOUNCE_MS } from "./geocode";
import { resolveQuery, type EndpointRole, type ResolvedEndpoint } from "./resolve";
import { debounce } from "./debounce";

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

// ---- Graph load (Stage 2) ------------------------------------------------
// Load V2's artifact client-side (recorded strategy), showing a LOADING indicator and, on any
// failure, the blocking GraphLoadError state with a RETRY. The loaded graph + snapping grid are
// cached for the session (in graphLoader) for the geocoding/routing stages to consume.
const overlay = new ScreenOverlay(refs.screen);
let loaded: LoadedGraph | null = null;

function setStatus(text: string, fault = false): void {
  refs.headerStatus.textContent = text;
  refs.headerStatus.dataset.fault = String(fault);
}

async function initGraph(): Promise<void> {
  overlay.showLoading("LOADING GRAPH", "Front Range street network");
  setStatus("LOADING…");
  const outcome = await loadGraph();
  if (outcome.ok) {
    loaded = outcome.data;
    const { nodeCount, edgeCount } = outcome.data.meta;
    // Verify hook: counts should match V2 (1,426,625 nodes / 3,631,737 edges).
    console.info(`[loose-bearing] graph loaded: ${nodeCount} nodes / ${edgeCount} edges`);
    setStatus(
      `${(nodeCount / 1e6).toFixed(2)}M NODES · ${(edgeCount / 1e6).toFixed(2)}M EDGES`,
    );
    overlay.hide();
  } else {
    loaded = null;
    console.error(`[loose-bearing] GraphLoadError: ${outcome.detail}`);
    setStatus("GRAPH LOAD ERROR", true);
    overlay.showFault("GRAPH LOAD ERROR", outcome.detail, [
      { label: "RETRY", onClick: () => void initGraph() },
    ]);
  }
}

void initGraph();

// ---- Geocode + snap + resolve (Stage 3) ----------------------------------
// Each text input resolves (debounced) through geocode → snap into a graph node id, showing
// the correct pre-route failure state (GeocodeMiss / Origin|DestinationOffNetwork) under the
// field. Resolved endpoints are held here; Stage 4 formalizes the query lifecycle + re-route.
const geocoder = new NominatimGeocoder();
const endpoints: { origin: ResolvedEndpoint | null; dest: ResolvedEndpoint | null } = {
  origin: null,
  dest: null,
};
const inFlight: Record<EndpointRole, AbortController | null> = { origin: null, dest: null };

function setFieldStatus(el: HTMLElement, text: string, state: "" | "ok" | "fault" | "busy"): void {
  el.textContent = text;
  el.dataset.state = state;
}

const FAILURE_LABEL: Record<string, string> = {
  GeocodeMiss: "NO MATCH",
  OriginOffNetwork: "OFF NETWORK",
  DestinationOffNetwork: "OFF NETWORK",
};

async function resolveField(role: EndpointRole, query: string, statusEl: HTMLElement): Promise<void> {
  inFlight[role]?.abort();
  const q = query.trim();
  if (q.length === 0) {
    endpoints[role] = null;
    setFieldStatus(statusEl, "", "");
    return;
  }
  if (!loaded) {
    setFieldStatus(statusEl, "GRAPH NOT LOADED", "fault");
    return;
  }
  const ctrl = new AbortController();
  inFlight[role] = ctrl;
  setFieldStatus(statusEl, "RESOLVING…", "busy");
  try {
    const outcome = await resolveQuery(q, role, geocoder, loaded.grid, ctrl.signal);
    if (ctrl.signal.aborted) return; // superseded by a newer query
    if (outcome.ok) {
      endpoints[role] = outcome.endpoint;
      const short = outcome.endpoint.label.split(",")[0];
      setFieldStatus(statusEl, `SNAP ${Math.round(outcome.endpoint.snapMeters)}M · ${short}`, "ok");
    } else {
      endpoints[role] = null;
      setFieldStatus(statusEl, FAILURE_LABEL[outcome.state] ?? outcome.state, "fault");
    }
  } catch (err) {
    if (ctrl.signal.aborted) return;
    endpoints[role] = null;
    // A transient network/geocoder error is NOT one of the five states — report it plainly.
    setFieldStatus(statusEl, "GEOCODER ERROR", "fault");
    console.error("[loose-bearing] geocoder error:", err);
  }
}

const debouncedA = debounce(() => void resolveField("origin", refs.inputA.value, refs.statusA), DEBOUNCE_MS);
const debouncedB = debounce(() => void resolveField("dest", refs.inputB.value, refs.statusB), DEBOUNCE_MS);
refs.inputA.addEventListener("input", debouncedA);
refs.inputB.addEventListener("input", debouncedB);

// Expose for later stages / debugging without a global type leak.
(window as unknown as { __lbMap?: maplibregl.Map; __lbGraph?: () => LoadedGraph | null }).__lbMap =
  map;
(window as unknown as { __lbGraph?: () => LoadedGraph | null }).__lbGraph = () => loaded;
