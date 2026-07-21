// The map renderer (V4, Stage 5). Consumes a pure `RenderPlan` and draws it on the MapLibre
// map as flat, glow-free geometry in the artifact's palette: the constrained route as ONE green
// line, or the fault state as a red stub + a red trap box (never a fake through-line). The
// direct reference line (Stage 6) will layer in via the same renderer.
//
// setStyle() (theme swap) wipes sources/layers, so the renderer re-installs and redraws on every
// `style.load`, and keeps the last plan so a theme toggle preserves the drawn route. The trap is
// a Marker (markers survive style swaps) so it stays crisp and square.

import maplibregl from "maplibre-gl";
import type { Feature, FeatureCollection, LineString } from "geojson";
import { PALETTE, type Theme } from "./mapStyle";
import type { RenderPlan, LngLat } from "./routeGeometry";

const ROUTE_SRC = "lb-route-src";
const ROUTE_LAYER = "lb-route-line";
const FAULT_SRC = "lb-fault-src";
const FAULT_LAYER = "lb-fault-line";

type LineFC = FeatureCollection<LineString>;

function lineFC(coords: LngLat[]): LineFC {
  const features: Feature<LineString>[] =
    coords.length >= 2
      ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } }]
      : [];
  return { type: "FeatureCollection", features };
}

const EMPTY: LineFC = { type: "FeatureCollection", features: [] };

export class RouteRenderer {
  private plan: RenderPlan = { kind: "none" };
  private trapMarker: maplibregl.Marker | null = null;

  constructor(
    private readonly map: maplibregl.Map,
    private theme: Theme,
  ) {
    // Re-install + redraw after every style load (initial load and each theme swap).
    map.on("style.load", () => {
      this.install();
      this.draw();
    });
    if (map.isStyleLoaded()) {
      this.install();
      this.draw();
    }
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
    if (this.map.getLayer(ROUTE_LAYER)) {
      this.map.setPaintProperty(ROUTE_LAYER, "line-color", PALETTE[theme].signal);
    }
    if (this.map.getLayer(FAULT_LAYER)) {
      this.map.setPaintProperty(FAULT_LAYER, "line-color", PALETTE[theme].fault);
    }
    this.styleTrap();
  }

  /** Apply a render plan (pure input from routeGeometry). */
  apply(plan: RenderPlan): void {
    this.plan = plan;
    this.draw();
  }

  clear(): void {
    this.apply({ kind: "none" });
  }

  private install(): void {
    if (!this.map.getSource(ROUTE_SRC)) {
      this.map.addSource(ROUTE_SRC, { type: "geojson", data: EMPTY });
      this.map.addLayer({
        id: ROUTE_LAYER,
        type: "line",
        source: ROUTE_SRC,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": PALETTE[this.theme].signal, "line-width": 3 },
      });
    }
    if (!this.map.getSource(FAULT_SRC)) {
      this.map.addSource(FAULT_SRC, { type: "geojson", data: EMPTY });
      this.map.addLayer({
        id: FAULT_LAYER,
        type: "line",
        source: FAULT_SRC,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": PALETTE[this.theme].fault, "line-width": 3, "line-dasharray": [2, 1.5] },
      });
    }
  }

  private draw(): void {
    const routeSrc = this.map.getSource(ROUTE_SRC) as maplibregl.GeoJSONSource | undefined;
    const faultSrc = this.map.getSource(FAULT_SRC) as maplibregl.GeoJSONSource | undefined;
    if (!routeSrc || !faultSrc) return; // style not ready yet — draw() re-runs on style.load

    const plan = this.plan;
    if (plan.kind === "route") {
      routeSrc.setData(lineFC(plan.line));
      faultSrc.setData(EMPTY);
      this.setTrap(null);
    } else if (plan.kind === "fault") {
      routeSrc.setData(EMPTY);
      faultSrc.setData(plan.stub ? lineFC(plan.stub) : EMPTY);
      this.setTrap(plan.trap);
    } else {
      routeSrc.setData(EMPTY);
      faultSrc.setData(EMPTY);
      this.setTrap(null);
    }
  }

  private setTrap(coord: { lat: number; lng: number } | null): void {
    if (!coord) {
      this.trapMarker?.remove();
      this.trapMarker = null;
      return;
    }
    if (!this.trapMarker) {
      const el = document.createElement("div");
      el.className = "lb-trap";
      this.trapMarker = new maplibregl.Marker({ element: el, anchor: "center" });
      this.styleTrap();
    }
    this.trapMarker.setLngLat([coord.lng, coord.lat]).addTo(this.map);
  }

  private styleTrap(): void {
    const el = this.trapMarker?.getElement();
    if (el) el.style.setProperty("--trap-color", PALETTE[this.theme].fault);
  }
}
