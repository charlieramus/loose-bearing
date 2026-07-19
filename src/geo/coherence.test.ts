import { describe, it, expect } from "vitest";
import { initialBearingDeg } from "./geo";
import { isBearingLegal } from "./bearingRule";
import { outEdges } from "../graph/types";
import { gridGraph } from "../graph/fixtures";

// End-to-end coherence: the geo core, the rule predicate, and a fixture graph compose the
// way the V3 router will use them — a legal turn and an illegal turn on gridGraph, judged
// by the real predicate. This is the "walkthrough" proving the foundation is whole.

describe("coherence — the rule on gridGraph, end to end", () => {
  // Route from interior node 5 toward the NE corner node 15. Bearing ≈ 45°.
  const START = 5;
  const DEST = 15;

  const startNode = gridGraph.nodes.find((n) => n.id === START)!;
  const destNode = gridGraph.nodes.find((n) => n.id === DEST)!;
  const bearingToDest = initialBearingDeg(startNode, destNode);

  it("the destination is to the north-east (bearing ~45°)", () => {
    expect(bearingToDest).toBeGreaterThan(30);
    expect(bearingToDest).toBeLessThan(60);
  });

  it("a turn toward the destination is LEGAL (east edge 5→6, bearing ~90°)", () => {
    const east = outEdges(gridGraph, START).find((e) => e.to === 6)!;
    expect(east.bearingDeg).toBeCloseTo(90, 0);
    expect(isBearingLegal(east.bearingDeg, bearingToDest)).toBe(true);
  });

  it("a turn away from the destination is ILLEGAL (west edge 5→4, bearing ~270°)", () => {
    const west = outEdges(gridGraph, START).find((e) => e.to === 4)!;
    expect(west.bearingDeg).toBeCloseTo(270, 0);
    expect(isBearingLegal(west.bearingDeg, bearingToDest)).toBe(false);
  });
});
