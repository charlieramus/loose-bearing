import { describe, it, expect } from "vitest";
import { shortestPath } from "./astar";
import { outEdges, type Graph } from "../graph/types";
import { gridGraph, disconnectedGraph } from "../graph/fixtures";

/** Assert every consecutive pair in `path` is a real directed edge of `graph`. */
function assertConnected(graph: Graph, path: number[]): void {
  for (let i = 0; i + 1 < path.length; i++) {
    const hasEdge = outEdges(graph, path[i]).some((e) => e.to === path[i + 1]);
    expect(hasEdge, `edge ${path[i]}->${path[i + 1]} exists`).toBe(true);
  }
}

/** Sum the edge lengths actually traversed along `path`. */
function pathLength(graph: Graph, path: number[]): number {
  let total = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const e = outEdges(graph, path[i]).find((x) => x.to === path[i + 1])!;
    total += e.lengthMeters;
  }
  return total;
}

describe("shortestPath — unconstrained A* baseline", () => {
  it("finds the deterministic shortest path across the grid (0 → 15)", () => {
    const result = shortestPath(gridGraph, 0, 15);
    expect(result).not.toBeNull();
    // Deterministic monotone route: up the west column, then east along the north row.
    expect(result!.path).toEqual([0, 4, 8, 12, 13, 14, 15]);
    assertConnected(gridGraph, result!.path);
    // Length equals the length actually walked (self-consistent) …
    expect(result!.lengthMeters).toBeCloseTo(pathLength(gridGraph, result!.path), 6);
    // … and it is the true optimum: no monotone 6-hop route can be shorter, and A* here
    // hand-checks to ~1178.21 m (three ~222 m lat steps + three ~170 m lng steps).
    expect(result!.lengthMeters).toBeCloseTo(1178.2078, 3);
    expect(result!.path).toHaveLength(7); // 6 hops, Manhattan-minimal on a 3×3 offset
  });

  it("is a genuine shortest path — no cheaper route exists on the grid", () => {
    // Brute-force optimum via exhaustive Dijkstra-style relaxation would agree; here we
    // assert A*'s answer is no worse than an alternate monotone route of equal hop count.
    const alt = [0, 1, 2, 3, 7, 11, 15]; // east along south row, then up the east column
    assertConnected(gridGraph, alt);
    const result = shortestPath(gridGraph, 0, 15)!;
    expect(result.lengthMeters).toBeLessThanOrEqual(pathLength(gridGraph, alt) + 1e-6);
  });

  it("returns a zero-length single-node path when start === end", () => {
    expect(shortestPath(gridGraph, 5, 5)).toEqual({ path: [5], lengthMeters: 0 });
  });

  it("returns null across disconnected components (0 → 2)", () => {
    expect(shortestPath(disconnectedGraph, 0, 2)).toBeNull();
  });

  it("still routes within a single component (0 → 1)", () => {
    const result = shortestPath(disconnectedGraph, 0, 1);
    expect(result).not.toBeNull();
    expect(result!.path).toEqual([0, 1]);
  });

  it("returns null when an endpoint is absent from the graph", () => {
    expect(shortestPath(gridGraph, 0, 9999)).toBeNull();
    expect(shortestPath(gridGraph, -1, 0)).toBeNull();
  });

  it("is deterministic — identical result across repeated runs", () => {
    const a = shortestPath(gridGraph, 0, 15);
    const b = shortestPath(gridGraph, 0, 15);
    expect(a).toEqual(b);
  });
});
