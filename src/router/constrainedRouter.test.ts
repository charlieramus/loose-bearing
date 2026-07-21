import { describe, it, expect } from "vitest";
import { findConstrainedRoute } from "./constrainedRouter";
import { outEdges, type Graph } from "../graph/types";
import { initialBearingDeg } from "../geo/geo";
import { isBearingLegal } from "../geo/bearingRule";
import { gridGraph, trapGraph, TRAP_START_NODE, TRAP_DEST_NODE } from "../graph/fixtures";

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
    const route = findConstrainedRoute(trapGraph, TRAP_START_NODE, TRAP_DEST_NODE);
    expect(route).toBeNull();
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
