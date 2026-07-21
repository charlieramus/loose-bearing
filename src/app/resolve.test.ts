// Stage 3 verification: geocode → snap → the correct pre-route state. Covers the three
// outcomes the stage calls out — a real address resolves + snaps to a node, a nonsense query
// is GeocodeMiss, and an off-network coordinate (reservoir interior) is Origin/DestinationOff-
// Network (NOT a routing failure). Uses a mock geocoder + a small synthetic grid — no network.

import { describe, it, expect } from "vitest";
import { buildGrid } from "../../build/spatial";
import type { Node } from "../graph/types";
import { snapToNode, SNAP_RADIUS_METERS } from "./snap";
import { resolveQuery, resolveCoord } from "./resolve";
import type { Geocoder, GeocodeResult } from "./geocode";

// A few Denver-area nodes on the "network".
const nodes: Node[] = [
  { id: 0, lat: 39.74, lng: -104.99 },
  { id: 1, lat: 39.7415, lng: -104.9885 },
  { id: 2, lat: 39.75, lng: -104.98 },
];
const grid = buildGrid(nodes);

class MockGeocoder implements Geocoder {
  constructor(private readonly result: GeocodeResult) {}
  async geocode(): Promise<GeocodeResult> {
    return this.result;
  }
}

// A coordinate far from every node (open water / prairie) — well beyond the snap radius.
const OFF_NETWORK = { lat: 39.9, lng: -105.25 };

describe("snapToNode", () => {
  it("snaps a near coordinate to the closest node", () => {
    const r = snapToNode(grid, { lat: 39.7401, lng: -104.9899 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nodeId).toBe(0);
    expect(r.meters).toBeLessThan(SNAP_RADIUS_METERS);
  });

  it("misses when nothing is within the snap radius", () => {
    expect(snapToNode(grid, OFF_NETWORK).ok).toBe(false);
  });
});

describe("resolveQuery", () => {
  it("resolves a real address and snaps it to a node", async () => {
    const geo = new MockGeocoder({
      kind: "hit",
      lat: 39.7402,
      lng: -104.9898,
      label: "Union Station, Denver, Colorado",
    });
    const out = await resolveQuery("union station denver", "origin", geo, grid);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.endpoint.nodeId).toBe(0);
    expect(out.endpoint.label).toContain("Union Station");
  });

  it("returns GeocodeMiss for a nonsense query", async () => {
    const geo = new MockGeocoder({ kind: "miss" });
    const out = await resolveQuery("asdfqwer zzz", "origin", geo, grid);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.state).toBe("GeocodeMiss");
  });

  it("returns OffNetwork (role-specific) for a reservoir-interior coordinate", async () => {
    const geo = new MockGeocoder({ kind: "hit", ...OFF_NETWORK, label: "Middle of a reservoir" });
    const asOrigin = await resolveQuery("reservoir", "origin", geo, grid);
    const asDest = await resolveQuery("reservoir", "dest", geo, grid);
    expect(asOrigin.ok).toBe(false);
    expect(asDest.ok).toBe(false);
    if (asOrigin.ok || asDest.ok) return;
    expect(asOrigin.state).toBe("OriginOffNetwork");
    expect(asDest.state).toBe("DestinationOffNetwork");
  });
});

describe("resolveCoord (map click, Stage 4 seam)", () => {
  it("snaps a clicked coordinate, never GeocodeMiss", () => {
    const hit = resolveCoord({ lat: 39.7401, lng: -104.9899 }, "origin", grid);
    expect(hit.ok).toBe(true);
    const off = resolveCoord(OFF_NETWORK, "dest", grid);
    expect(off.ok).toBe(false);
    if (off.ok) return;
    expect(off.state).toBe("DestinationOffNetwork");
  });
});
