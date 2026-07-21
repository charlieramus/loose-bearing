import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { findConstrainedRoute, findConstrainedRouteWithExploration } from "./constrainedRouter";
import { route } from "./result";
import { outEdges, type Graph } from "../graph/types";
import { initialBearingDeg } from "../geo/geo";
import { isBearingLegal } from "../geo/bearingRule";
import {
  gridGraph,
  trapGraph,
  disconnectedGraph,
  detourGraph,
  TRAP_START_NODE,
  TRAP_DEST_NODE,
  DETOUR_START,
  DETOUR_DEST,
} from "../graph/fixtures";

/** Assert every hop of `path` toward `endId` obeys the 90° rule (via the real predicate). */
function assertAllTurnsLegal(graph: Graph, path: number[], endId: number): void {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const end = byId.get(endId)!;
  for (let i = 0; i + 1 < path.length; i++) {
    const u = byId.get(path[i])!;
    const edge = outEdges(graph, path[i]).find((e) => e.to === path[i + 1])!;
    const bearingToDest = initialBearingDeg(u, end);
    expect(
      isBearingLegal(edge.bearingDeg, bearingToDest),
      `hop ${path[i]}->${path[i + 1]} legal toward ${endId}`,
    ).toBe(true);
  }
}

describe("findConstrainedRoute — bearing-gated A*", () => {
  it("routes across the grid using only bearing-legal turns (0 → 15)", () => {
    const route = findConstrainedRoute(gridGraph, 0, 15);
    expect(route).not.toBeNull();
    expect(route!.path[0]).toBe(0);
    expect(route!.path.at(-1)).toBe(15);
    assertAllTurnsLegal(gridGraph, route!.path, 15);
  });

  it("every legal grid destination is reached with only legal turns", () => {
    // Spot-check several endpoints; on a grid the rule rarely binds, but every hop the
    // router emits must still pass the predicate.
    for (const end of [3, 12, 10, 15]) {
      const route = findConstrainedRoute(gridGraph, 0, end);
      expect(route, `route 0 → ${end}`).not.toBeNull();
      assertAllTurnsLegal(gridGraph, route!.path, end);
    }
  });

  it("returns null toward a bearing-unreachable trap destination", () => {
    // START sits due south of DEST; every exit from START points > 90° off north, so no
    // legal first step exists even though START → A → DEST is graph-connected.
    const trapRoute = findConstrainedRoute(trapGraph, TRAP_START_NODE, TRAP_DEST_NODE);
    expect(trapRoute).toBeNull();
  });

  it("still returns the trivial route when start === end", () => {
    expect(findConstrainedRoute(gridGraph, 7, 7)).toEqual({ path: [7], lengthMeters: 0 });
  });

  it("is deterministic across repeated runs", () => {
    const a = findConstrainedRoute(gridGraph, 0, 15);
    const b = findConstrainedRoute(gridGraph, 0, 15);
    expect(a).toEqual(b);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// V3 consolidation — the router's safety net. One place that exercises the whole
// contract V4/V5 depend on: shortest valid path, the full failure taxonomy, the detour
// factor, and — the hard requirement — determinism of both the path AND the settle order.
// ─────────────────────────────────────────────────────────────────────────────

describe("router coherence (V3 consolidation)", () => {
  it("shortest VALID path on a fixture, using only legal turns", () => {
    const r = route(gridGraph, 0, 15);
    expect(r.kind).toBe("success");
    if (r.kind !== "success") throw new Error("unreachable");
    expect(r.path).toEqual([0, 4, 8, 12, 13, 14, 15]);
    assertAllTurnsLegal(gridGraph, r.path, 15);
  });

  it("trap → NoBearingLegalPath (the feature)", () => {
    const r = route(trapGraph, TRAP_START_NODE, TRAP_DEST_NODE);
    expect(r).toMatchObject({ kind: "failure", reason: "NoBearingLegalPath" });
  });

  it("disconnected → Disconnected (never NoBearingLegalPath)", () => {
    const r = route(disconnectedGraph, 0, 2);
    expect(r).toMatchObject({ kind: "failure", reason: "Disconnected" });
    if (r.kind === "failure") expect(r.reason).not.toBe("NoBearingLegalPath");
  });

  it("every failure reason is reachable via a targeted fixture", () => {
    const reasons = [
      route(gridGraph, 9999, 0), // OriginOffNetwork
      route(gridGraph, 0, 9999), // DestinationOffNetwork
      route(disconnectedGraph, 0, 2), // Disconnected
      route(trapGraph, TRAP_START_NODE, TRAP_DEST_NODE), // NoBearingLegalPath
    ].map((r) => (r.kind === "failure" ? r.reason : "success"));
    expect(reasons).toEqual([
      "OriginOffNetwork",
      "DestinationOffNetwork",
      "Disconnected",
      "NoBearingLegalPath",
    ]);
  });

  it("detour factor: known value on detourGraph, ~1.0 where the rule does not bind", () => {
    const bound = route(detourGraph, DETOUR_START, DETOUR_DEST);
    const flat = route(gridGraph, 0, 15);
    if (bound.kind !== "success" || flat.kind !== "success") throw new Error("unreachable");
    expect(bound.detourFactor).toBeCloseTo(1.4291, 3);
    expect(bound.detourFactor).toBeGreaterThan(1);
    expect(flat.detourFactor).toBeCloseTo(1.0, 6);
  });

  it("DETERMINISM GUARD: identical path AND identical settle order across runs", () => {
    // Run the SAME (start, end) twice; both the route and the captured exploration order
    // must be byte-for-byte identical, or permalinks/replay in V4/V5 break. This test would
    // fail if an unstable tie-break, Set iteration order, or randomness crept in.
    const a = findConstrainedRouteWithExploration(gridGraph, 0, 15);
    const b = findConstrainedRouteWithExploration(gridGraph, 0, 15);
    expect(a.result).toEqual(b.result);
    expect(a.exploration.settledOrder).toEqual(b.exploration.settledOrder);
    expect(a.exploration.frontier).toEqual(b.exploration.frontier);
    // And the settle order is the specific, pinned sequence.
    expect(a.exploration.settledOrder).toEqual([0, 4, 1, 5, 8, 9, 2, 6, 10, 12, 13, 14]);
  });

  it("DETERMINISM GUARD: no Math.random / Date.now in the search path", () => {
    // Static guard — the search must be a pure function of its inputs.
    const sources = ["./astar.ts", "./constrainedRouter.ts", "./heap.ts", "./result.ts"];
    for (const rel of sources) {
      const src = readFileSync(new URL(rel, import.meta.url), "utf8");
      expect(src, `${rel} uses Math.random`).not.toMatch(/Math\s*\.\s*random/);
      expect(src, `${rel} uses Date.now`).not.toMatch(/Date\s*\.\s*now/);
      expect(src, `${rel} uses new Date`).not.toMatch(/new\s+Date\b/);
    }
  });
});
