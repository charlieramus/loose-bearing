import { describe, it, expect } from "vitest";
import { route, type Success } from "./result";
import { haversineMeters } from "../geo/geo";
import {
  gridGraph,
  detourGraph,
  DETOUR_START,
  DETOUR_DEST,
} from "../graph/fixtures";

function asSuccess(r: ReturnType<typeof route>): Success {
  if (r.kind !== "success") throw new Error(`expected success, got ${JSON.stringify(r)}`);
  return r;
}

describe("detour factor", () => {
  it("matches the hand calculation on detourGraph (known binding detour)", () => {
    const r = asSuccess(route(detourGraph, DETOUR_START, DETOUR_DEST));
    // The rule forces the legal north-east detour S→N→D instead of the cheaper westward
    // S→W→D (whose first hop points away from the eastern destination).
    expect(r.path).toEqual([0, 3, 1]); // S → N → D

    const byId = new Map(detourGraph.nodes.map((n) => [n.id, n]));
    const S = byId.get(0)!, D = byId.get(1)!, W = byId.get(2)!, N = byId.get(3)!;
    const unconstrained = haversineMeters(S, W) + haversineMeters(W, D); // the W route
    const constrained = haversineMeters(S, N) + haversineMeters(N, D); // the N route
    const expected = constrained / unconstrained;

    expect(r.lengthMeters).toBeCloseTo(constrained, 6);
    expect(r.detourFactor).toBeCloseTo(expected, 9);
    expect(r.detourFactor).toBeCloseTo(1.4291, 3); // ~1.43 for these coordinates
    expect(r.detourFactor).toBeGreaterThan(1);
  });

  it("is ~1.0 on the grid, where the rule does not bind", () => {
    const r = asSuccess(route(gridGraph, 0, 15));
    expect(r.detourFactor).toBeCloseTo(1.0, 6);
  });

  it("is exactly 1.0 for a trivial start === end route", () => {
    const r = asSuccess(route(gridGraph, 5, 5));
    expect(r.detourFactor).toBe(1);
    expect(r.lengthMeters).toBe(0);
  });
});
