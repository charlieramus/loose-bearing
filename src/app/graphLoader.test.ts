// Stage 2 verification: the runtime loader reconstructs V2's artifact into the router's
// `Graph` + snapping `Grid` on the happy path, and collapses every failure mode (network
// error, wrong version, malformed arrays) to the single `GraphLoadError` taxonomy state.
// Uses a synthetic artifact through the `fetcher` seam — no 100 MB file needed here.

import { describe, it, expect, beforeEach } from "vitest";
import { serializeGraph, type GraphArtifact } from "../../build/serialize";
import { nearest } from "../../build/spatial";
import type { Graph } from "../graph/types";
import { loadGraph, cachedGraph, __resetGraphCache, GRAPH_URL } from "./graphLoader";

// A tiny 3-node Front Range graph: two directed edges 0→1→2.
function tinyArtifact(): GraphArtifact {
  const nodes = [
    { id: 0, lat: 39.74, lng: -104.99 },
    { id: 1, lat: 39.75, lng: -104.98 },
    { id: 2, lat: 39.76, lng: -104.97 },
  ];
  const graph: Graph = {
    nodes,
    adjacency: new Map([
      [0, [{ from: 0, to: 1, bearingDeg: 45, lengthMeters: 1200 }]],
      [1, [{ from: 1, to: 2, bearingDeg: 45, lengthMeters: 1200 }]],
      [2, []],
    ]),
  };
  return serializeGraph(
    graph,
    { minLat: 38.2, maxLat: 40.65, minLng: -105.35, maxLng: -104.6 },
    "© OpenStreetMap contributors",
  );
}

beforeEach(() => __resetGraphCache());

describe("loadGraph — success", () => {
  it("reconstructs the graph, grid, and meta from a valid artifact", async () => {
    const artifact = tinyArtifact();
    const outcome = await loadGraph({ fetcher: async () => artifact });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.meta.nodeCount).toBe(3);
    expect(outcome.data.meta.edgeCount).toBe(2);
    expect(outcome.data.graph.nodes).toHaveLength(3);
    // Adjacency survives the round-trip.
    expect(outcome.data.graph.adjacency.get(0)?.[0]?.to).toBe(1);
    // The snapping grid works: nearest node to node 1's coord is node 1.
    const hit = nearest(outcome.data.grid, { lat: 39.75, lng: -104.98 });
    expect(hit?.id).toBe(1);
  });

  it("caches the loaded graph for the session", async () => {
    const artifact = tinyArtifact();
    await loadGraph({ fetcher: async () => artifact });
    expect(cachedGraph()?.meta.nodeCount).toBe(3);

    // A second call without `force` must not re-invoke the fetcher.
    let called = false;
    const outcome = await loadGraph({
      fetcher: async () => {
        called = true;
        return artifact;
      },
    });
    expect(outcome.ok).toBe(true);
    expect(called).toBe(false);
  });
});

describe("loadGraph — GraphLoadError", () => {
  it("maps a network / bad-path failure to GraphLoadError (not a throw)", async () => {
    const outcome = await loadGraph({
      fetcher: async () => {
        throw new Error("HTTP 404 Not Found for " + GRAPH_URL);
      },
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("GraphLoadError");
    expect(outcome.detail).toContain("404");
    expect(cachedGraph()).toBeNull();
  });

  it("rejects a wrong-version artifact", async () => {
    const bad = { ...tinyArtifact(), version: 999 };
    const outcome = await loadGraph({ fetcher: async () => bad });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("GraphLoadError");
    expect(outcome.detail).toMatch(/version/);
  });

  it("rejects a malformed artifact (array length mismatch)", async () => {
    const bad = tinyArtifact();
    bad.edgeTo = bad.edgeTo.slice(0, 1); // now inconsistent with edgeCount
    const outcome = await loadGraph({ fetcher: async () => bad });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("GraphLoadError");
    expect(outcome.detail).toMatch(/edgeTo/);
  });
});
