import { describe, it, expect } from "vitest";
import { outEdges, type Graph } from "./types";
import { initialBearingDeg } from "../geo/geo";
import { isBearingLegal } from "../geo/bearingRule";
import {
  gridGraph,
  trapGraph,
  disconnectedGraph,
  TRAP_START_NODE,
  TRAP_DEST_NODE,
} from "./fixtures";

/** Node ids reachable from `start` following directed edges (ignores the bearing rule). */
function reachableFrom(graph: Graph, start: number): Set<number> {
  const seen = new Set<number>([start]);
  const queue = [start];
  while (queue.length) {
    const n = queue.shift()!;
    for (const e of outEdges(graph, n)) {
      if (!seen.has(e.to)) {
        seen.add(e.to);
        queue.push(e.to);
      }
    }
  }
  return seen;
}

function totalEdges(graph: Graph): number {
  let n = 0;
  for (const list of graph.adjacency.values()) n += list.length;
  return n;
}

describe("gridGraph — 4×4 normal-ish fixture", () => {
  it("has 16 nodes and 48 directed edges (24 two-way segments)", () => {
    expect(gridGraph.nodes).toHaveLength(16);
    expect(totalEdges(gridGraph)).toBe(48);
  });

  it("corner node 0 has exactly 2 out-edges (east→1, north→4)", () => {
    const es = outEdges(gridGraph, 0).map((e) => e.to).sort((a, b) => a - b);
    expect(es).toEqual([1, 4]);
  });

  it("interior node 5 has 4 out-edges (its four grid neighbors)", () => {
    const es = outEdges(gridGraph, 5).map((e) => e.to).sort((a, b) => a - b);
    expect(es).toEqual([1, 4, 6, 9]); // south, west, east, north
  });

  it("is fully connected — every node reachable from node 0", () => {
    expect(reachableFrom(gridGraph, 0).size).toBe(16);
  });
});

describe("trapGraph — bearing-unreachable but graph-connected", () => {
  it("has 4 nodes and 4 directed edges", () => {
    expect(trapGraph.nodes).toHaveLength(4);
    expect(totalEdges(trapGraph)).toBe(4);
  });

  it("START has 2 out-edges (to A and B)", () => {
    const es = outEdges(trapGraph, TRAP_START_NODE).map((e) => e.to).sort();
    expect(es).toEqual([2, 3]);
  });

  it("remains connected: DEST is reachable from START ignoring the rule", () => {
    const reachable = reachableFrom(trapGraph, TRAP_START_NODE);
    expect(reachable.has(TRAP_DEST_NODE)).toBe(true);
    expect(reachable.size).toBe(4);
  });

  it("EVERY exit from START is illegal toward DEST (via the real predicate)", () => {
    const start = trapGraph.nodes.find((n) => n.id === TRAP_START_NODE)!;
    const dest = trapGraph.nodes.find((n) => n.id === TRAP_DEST_NODE)!;
    const bearingToDest = initialBearingDeg(start, dest);

    const exits = outEdges(trapGraph, TRAP_START_NODE);
    expect(exits.length).toBeGreaterThan(0);
    for (const e of exits) {
      expect(isBearingLegal(e.bearingDeg, bearingToDest)).toBe(false);
    }
  });
});

describe("disconnectedGraph — two separate components", () => {
  it("has 4 nodes and 4 directed edges (two two-way segments)", () => {
    expect(disconnectedGraph.nodes).toHaveLength(4);
    expect(totalEdges(disconnectedGraph)).toBe(4);
  });

  it("node 0 has exactly 1 out-edge (to 1) and no link to component two", () => {
    const es = outEdges(disconnectedGraph, 0).map((e) => e.to);
    expect(es).toEqual([1]);
  });

  it("component one {0,1} cannot reach component two {2,3}", () => {
    const reachable = reachableFrom(disconnectedGraph, 0);
    expect(reachable).toEqual(new Set([0, 1]));
    expect(reachable.has(2)).toBe(false);
    expect(reachable.has(3)).toBe(false);
  });
});
