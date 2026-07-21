import { describe, it, expect } from "vitest";
import {
  findConstrainedRoute,
  findConstrainedRouteWithExploration,
  MAX_REJECTED_DETAIL,
  type Exploration,
} from "./constrainedRouter";
import { outEdges, type Graph } from "../graph/types";
import { initialBearingDeg } from "../geo/geo";
import { isBearingLegal } from "../geo/bearingRule";
import { gridGraph, trapGraph, TRAP_START_NODE, TRAP_DEST_NODE } from "../graph/fixtures";

/** Every stored rejected edge must be a real out-edge that genuinely fails the rule. */
function assertRejectionsHonest(graph: Graph, endId: number, exp: Exploration): void {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const end = byId.get(endId)!;
  for (const [from, edges] of exp.rejectedByNode) {
    const bearingToDest = initialBearingDeg(byId.get(from)!, end);
    for (const r of edges) {
      const real = outEdges(graph, from).find((e) => e.to === r.to);
      expect(real, `rejected ${from}->${r.to} is a real edge`).toBeTruthy();
      expect(r.bearingDeg).toBe(real!.bearingDeg);
      expect(isBearingLegal(r.bearingDeg, bearingToDest)).toBe(false); // genuinely illegal
    }
  }
}

/** Cap invariants that must hold on any exploration. */
function assertBounded(exp: Exploration): void {
  expect(exp.rejectedDetailCount).toBeLessThanOrEqual(MAX_REJECTED_DETAIL);
  expect(exp.rejectedDetailCount).toBeLessThanOrEqual(exp.rejectedTotalCount);
  expect(exp.rejectedDetailCapped).toBe(exp.rejectedTotalCount > MAX_REJECTED_DETAIL);
  if (!exp.rejectedDetailCapped) {
    // Below the cap, stored detail equals the total observed…
    expect(exp.rejectedDetailCount).toBe(exp.rejectedTotalCount);
    const stored = [...exp.rejectedByNode.values()].reduce((n, l) => n + l.length, 0);
    expect(stored).toBe(exp.rejectedDetailCount);
  }
}

describe("Exploration capture — observing the constrained search", () => {
  it("capture does not change the pathfinding result", () => {
    const plain = findConstrainedRoute(gridGraph, 0, 15);
    const { result } = findConstrainedRouteWithExploration(gridGraph, 0, 15);
    expect(result).toEqual(plain);
  });

  it("hand trace on trapGraph: settle [START] and both exits rejected", () => {
    const { result, exploration } = findConstrainedRouteWithExploration(
      trapGraph,
      TRAP_START_NODE,
      TRAP_DEST_NODE,
    );
    expect(result).toBeNull(); // bearing-unreachable
    // START is the only node expanded; the destination is never reached, so nothing else settles.
    expect(exploration.settledOrder).toEqual([TRAP_START_NODE]);
    // Its two out-edges (to A=2, B=3) are both rejected — total and detail both 2.
    expect(exploration.rejectedTotalCount).toBe(2);
    expect(exploration.rejectedDetailCount).toBe(2);
    const rejected = exploration.rejectedByNode.get(TRAP_START_NODE)!;
    expect(rejected.map((r) => r.to).sort((a, b) => a - b)).toEqual([2, 3]);
    // Exhausted search → empty frontier.
    expect(exploration.frontier).toEqual([]);
    assertRejectionsHonest(trapGraph, TRAP_DEST_NODE, exploration);
    assertBounded(exploration);
  });

  it("hand trace on gridGraph 0 → 15: 12 nodes settled, 17 edges rejected, 3 left on frontier", () => {
    const { result, exploration } = findConstrainedRouteWithExploration(gridGraph, 0, 15);
    expect(result!.path).toEqual([0, 4, 8, 12, 13, 14, 15]);
    // Deterministic settle order (dest 15 is reached, not expanded, so it is not listed).
    expect(exploration.settledOrder).toEqual([0, 4, 1, 5, 8, 9, 2, 6, 10, 12, 13, 14]);
    expect(exploration.settledOrder).not.toContain(15);
    expect(exploration.rejectedTotalCount).toBe(17);
    // Nodes queued but never settled because the destination was found first.
    expect(new Set(exploration.frontier)).toEqual(new Set([3, 7, 11]));
    assertRejectionsHonest(gridGraph, 15, exploration);
    assertBounded(exploration);
  });

  it("is deterministic — identical exploration across repeated runs", () => {
    const a = findConstrainedRouteWithExploration(gridGraph, 0, 15).exploration;
    const b = findConstrainedRouteWithExploration(gridGraph, 0, 15).exploration;
    expect(a.settledOrder).toEqual(b.settledOrder);
    expect(a.frontier).toEqual(b.frontier);
    expect(a.rejectedTotalCount).toBe(b.rejectedTotalCount);
  });
});
