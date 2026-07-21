// The app controller (V4). Ties the shell inputs, the map pins, and the query lifecycle
// together over a loaded graph. Introduced in Stage 4 to keep main.ts a thin bootstrap and to
// give later stages (route render, readout panel, permalink) one coherent place to hook in.
//
// Responsibilities:
//   - resolve text inputs (debounced) and map clicks / pin drags into snapped endpoints,
//     keeping the pins and the field statuses in sync with whichever input was used;
//   - drive a single `QueryController` so any endpoint change re-routes with "latest wins"
//     and `origin === dest` is a trivial zero-length case;
//   - surface the query outcome (Stage 4: status + lifecycle; Stages 5–6 extend `onOutcome`
//     to draw the route/direct line and fill the readout panel).

import type maplibregl from "maplibre-gl";
import { haversineMeters, initialBearingDeg, type LatLng } from "../geo/geo";
import { route } from "../router";
import type { RouteResult } from "../router";
import type { ShellRefs } from "./shell";
import type { LoadedGraph } from "./graphLoader";
import { NominatimGeocoder, DEBOUNCE_MS, type Geocoder } from "./geocode";
import { resolveQuery, resolveCoord, type ResolvedEndpoint } from "./resolve";
import { debounce } from "./debounce";
import { Pins, type PinRole } from "./pins";
import { QueryController, type QueryOutcome } from "./queryController";
import { RouteRenderer } from "./routeLayer";
import { planFromResult } from "./routeGeometry";
import { Readout } from "./readout";
import { writePermalink, type PermalinkPair } from "./permalink";
import type { Theme } from "./mapStyle";

const FAILURE_LABEL: Record<string, string> = {
  GeocodeMiss: "NO MATCH",
  OriginOffNetwork: "OFF NETWORK",
  DestinationOffNetwork: "OFF NETWORK",
};

type FieldState = "" | "ok" | "fault" | "busy";

export class AppController {
  private graph: LoadedGraph | null = null;
  private readonly pins: Pins;
  private readonly query: QueryController;
  private readonly renderer: RouteRenderer;
  private readonly readout: Readout;
  private readonly geoAborts: Record<PinRole, AbortController | null> = {
    origin: null,
    dest: null,
  };

  constructor(
    private readonly refs: ShellRefs,
    private readonly map: maplibregl.Map,
    theme: Theme,
    private readonly geocoder: Geocoder = new NominatimGeocoder(),
  ) {
    this.pins = new Pins(map, (role, coord) => this.onPinDrag(role, coord));
    this.renderer = new RouteRenderer(map, theme);
    this.readout = new Readout(refs.readoutPanel, refs.compass, refs.bearingReadout);
    this.query = new QueryController(
      (start, end, signal) => this.runRoute(start, end, signal),
      (outcome) => this.onOutcome(outcome),
    );

    const debouncedA = debounce(() => void this.resolveTextField("origin"), DEBOUNCE_MS);
    const debouncedB = debounce(() => void this.resolveTextField("dest"), DEBOUNCE_MS);
    refs.inputA.addEventListener("input", debouncedA);
    refs.inputB.addEventListener("input", debouncedB);

    map.on("click", (e) => this.onMapClick({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
  }

  /** Called once the graph artifact has loaded — re-evaluates any endpoints already entered. */
  setGraph(graph: LoadedGraph): void {
    this.graph = graph;
    this.query.refresh();
  }

  /** Forward a theme change to the map renderer so drawn geometry recolors + survives the swap. */
  setTheme(theme: Theme): void {
    this.renderer.setTheme(theme);
  }

  // ---- Endpoint resolution -------------------------------------------------

  private inputFor(role: PinRole): HTMLInputElement {
    return role === "origin" ? this.refs.inputA : this.refs.inputB;
  }
  private statusElFor(role: PinRole): HTMLElement {
    return role === "origin" ? this.refs.statusA : this.refs.statusB;
  }
  private setField(role: PinRole, text: string, state: FieldState): void {
    const el = this.statusElFor(role);
    el.textContent = text;
    el.dataset.state = state;
  }

  /** Apply a successfully resolved endpoint: move the pin, sync status, and re-route. */
  private acceptEndpoint(ep: ResolvedEndpoint, syncInput: boolean): void {
    this.pins.set(ep.role, ep.coord);
    if (syncInput) this.inputFor(ep.role).value = ep.label;
    const short = ep.label.split(",")[0];
    this.setField(ep.role, `SNAP ${Math.round(ep.snapMeters)}M · ${short}`, "ok");
    this.query.setEndpoint(ep.role, ep);
  }

  /** Clear an endpoint (empty input) — remove its pin and re-route toward idle. */
  private clearEndpoint(role: PinRole): void {
    this.pins.clear(role);
    this.setField(role, "", "");
    this.query.setEndpoint(role, null);
  }

  /** Mark an endpoint as failed (fault status) without an accepted node. */
  private failEndpoint(role: PinRole, label: string): void {
    this.setField(role, label, "fault");
    this.query.setEndpoint(role, null);
  }

  private async resolveTextField(role: PinRole): Promise<void> {
    this.geoAborts[role]?.abort();
    const query = this.inputFor(role).value.trim();
    if (query.length === 0) {
      this.clearEndpoint(role);
      return;
    }
    if (!this.graph) {
      this.setField(role, "GRAPH NOT LOADED", "fault");
      return;
    }
    const ctrl = new AbortController();
    this.geoAborts[role] = ctrl;
    this.setField(role, "RESOLVING…", "busy");
    try {
      const outcome = await resolveQuery(query, role, this.geocoder, this.graph.grid, ctrl.signal);
      if (ctrl.signal.aborted) return; // superseded by a newer keystroke
      if (outcome.ok) this.acceptEndpoint(outcome.endpoint, false);
      else this.failEndpoint(role, FAILURE_LABEL[outcome.state] ?? outcome.state);
    } catch (err) {
      if (ctrl.signal.aborted) return;
      // Transient geocoder/network failure — not one of the five taxonomy states.
      this.setField(role, "GEOCODER ERROR", "fault");
      this.query.setEndpoint(role, null);
      console.error("[loose-bearing] geocoder error:", err);
    }
  }

  /** Which endpoint a fresh map click sets: origin, then dest, then a new pair. */
  private nextClickRole(): PinRole {
    if (!this.query.getOrigin()) return "origin";
    if (!this.query.getDest()) return "dest";
    return "origin"; // both set → start a fresh pair
  }

  /** Snap a coordinate for `role` and place it. On an off-network point, keep or drop the pin. */
  private placeCoord(role: PinRole, coord: LatLng, keepPinOnFault: boolean): void {
    if (!this.graph) return;
    const outcome = resolveCoord(coord, role, this.graph.grid);
    if (outcome.ok) {
      this.acceptEndpoint(outcome.endpoint, true);
      return;
    }
    if (keepPinOnFault) this.pins.set(role, coord);
    else this.pins.clear(role);
    this.inputFor(role).value = `${coord.lat.toFixed(5)}, ${coord.lng.toFixed(5)}`;
    this.failEndpoint(role, FAILURE_LABEL[outcome.state] ?? outcome.state);
  }

  private onMapClick(coord: LatLng): void {
    if (!this.graph) return;
    const role = this.nextClickRole();
    // Starting a fresh pair: drop the old destination first.
    if (role === "origin" && this.query.getOrigin() && this.query.getDest()) {
      this.clearEndpoint("dest");
      this.inputFor("dest").value = "";
    }
    this.placeCoord(role, coord, false);
  }

  private onPinDrag(role: PinRole, coord: LatLng): void {
    // Dropped off-network: keep the pin where the user left it, but no valid endpoint.
    this.placeCoord(role, coord, true);
  }

  /**
   * Apply a decoded permalink pair: snap both endpoints, fit the map to them, and let the query
   * lifecycle reproduce the identical deterministic route. Called once after the graph loads.
   */
  loadPermalink(pair: PermalinkPair): void {
    if (!this.graph) return;
    this.placeCoord("origin", pair.origin, false);
    this.placeCoord("dest", pair.dest, false);
    this.map.fitBounds(
      [
        [pair.origin.lng, pair.origin.lat],
        [pair.dest.lng, pair.dest.lat],
      ],
      { padding: 80, maxZoom: 14, duration: 0 },
    );
  }

  // ---- Routing lifecycle ---------------------------------------------------

  /**
   * The abortable route runner handed to the QueryController. The search is deferred to a
   * macrotask so a burst of rapid endpoint changes (which abort the prior job) collapses to a
   * single search for the final pair — the heavy synchronous V3 `route()` never runs for a
   * superseded request.
   */
  private runRoute(startId: number, endId: number, signal: AbortSignal): Promise<RouteResult> {
    const graph = this.graph;
    return new Promise<RouteResult>((resolve, reject) => {
      if (!graph) {
        reject(new Error("graph not loaded"));
        return;
      }
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException("aborted", "AbortError"));
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        if (signal.aborted) {
          reject(new DOMException("aborted", "AbortError"));
          return;
        }
        resolve(route(graph.graph, startId, endId));
      }, 0);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  private setStatus(text: string, fault = false): void {
    this.refs.headerStatus.textContent = text;
    this.refs.headerStatus.dataset.fault = String(fault);
  }

  /**
   * Handle a query outcome. Reflects the lifecycle in the header status and, for `routed`,
   * draws the route (or the fault stub/trap) via the pure `planFromResult` → renderer path and
   * fills the numbered route list. Stage 6 extends this to draw the direct line + readout panel.
   */
  private onOutcome(outcome: QueryOutcome): void {
    switch (outcome.kind) {
      case "idle":
        this.setStatus("READY");
        this.renderer.clear();
        this.renderer.setDirect(null, null);
        this.readout.clear();
        this.renderRouteList([]);
        break;
      case "pending": {
        this.setStatus("ROUTING…");
        // The direct crow-flies line + bearing are known immediately from the two endpoints.
        this.renderer.setDirect(outcome.origin.coord, outcome.dest.coord);
        const direct = haversineMeters(outcome.origin.coord, outcome.dest.coord);
        const bearing = initialBearingDeg(outcome.origin.coord, outcome.dest.coord);
        this.readout.pending(bearing, direct);
        this.renderRouteList([
          { idx: "A", text: this.shortLabel(outcome.origin.label) },
          { idx: "B", text: this.shortLabel(outcome.dest.label) },
        ]);
        break;
      }
      case "trivial":
        this.setStatus("ZERO LENGTH");
        this.renderer.clear();
        this.renderer.setDirect(null, null);
        this.readout.clear();
        this.renderRouteList([{ idx: "=", text: "A = B · ZERO LENGTH" }]);
        break;
      case "routed":
        this.renderRouted(outcome.result, outcome.origin, outcome.dest);
        break;
    }
  }

  private renderRouted(
    result: RouteResult,
    origin: ResolvedEndpoint,
    dest: ResolvedEndpoint,
  ): void {
    if (!this.graph) return;
    this.setStatus(this.statusForResult(result), result.kind === "failure");
    // The map render is a pure function of the router result (RenderPlan) — V5 reuses it.
    this.renderer.apply(planFromResult(this.graph.graph, result, origin, dest));
    // The direct A→B reference line is always the crow-flies segment between the endpoints.
    this.renderer.setDirect(origin.coord, dest.coord);
    // A route was computed → make it shareable. Encode the SNAPPED coords so a reload snaps back
    // to the same nodes and reproduces the identical deterministic route.
    writePermalink(origin.coord, dest.coord);

    // Distances/bearing come from the geo core (never recomputed here — DRY invariant).
    const directMeters = haversineMeters(origin.coord, dest.coord);
    const bearingDeg = initialBearingDeg(origin.coord, dest.coord);

    const entries = [
      { idx: "A", text: this.shortLabel(origin.label) },
      { idx: "B", text: this.shortLabel(dest.label) },
    ];
    if (result.kind === "success") {
      this.readout.success({
        detourFactor: result.detourFactor,
        distanceMeters: result.lengthMeters,
        directMeters,
        nodesExplored: result.exploration.settledOrder.length,
        refusedTurns: result.exploration.rejectedTotalCount,
        bearingDeg,
      });
      const km = (result.lengthMeters / 1000).toFixed(2);
      entries.push({ idx: "·", text: `${km} KM · ${result.path.length} NODES` });
    } else {
      // The 4th cell relabels to DEAD ENDS: the rule-refused edges that walled the search in.
      const exploration = result.exploration;
      this.readout.fault({
        directMeters,
        nodesExplored: exploration?.settledOrder.length ?? 0,
        deadEnds: exploration?.rejectedTotalCount ?? 0,
        bearingDeg,
        label: this.statusForResult(result),
      });
      entries.push({ idx: "!", text: this.statusForResult(result) });
    }
    this.renderRouteList(entries);
  }

  private shortLabel(label: string): string {
    return label.split(",")[0];
  }

  private renderRouteList(entries: { idx: string; text: string }[]): void {
    const list = this.refs.routeList;
    list.textContent = "";
    for (const entry of entries) {
      const li = document.createElement("li");
      li.className = "lb-routestep";
      const idx = document.createElement("span");
      idx.className = "lb-routestep-idx";
      idx.textContent = entry.idx;
      const text = document.createElement("span");
      text.textContent = entry.text;
      li.append(idx, text);
      list.append(li);
    }
  }

  private statusForResult(result: RouteResult): string {
    if (result.kind === "success") return "ROUTE OK";
    switch (result.reason) {
      case "NoBearingLegalPath":
        return "NO PATH";
      case "Disconnected":
        return "DISCONNECTED";
      case "OriginOffNetwork":
        return "ORIGIN OFF NET";
      case "DestinationOffNetwork":
        return "DEST OFF NET";
      default:
        return result.reason;
    }
  }
}
