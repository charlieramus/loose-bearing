// Stage 5 verification: the render is a PURE function of the router result. A success maps to a
// green route polyline; a NoBearingLegalPath maps to a red stub (origin → trap) + a trap box at
// the deepest settled node — never a through-line; a Disconnected marks the destination; other
// reasons draw nothing.

import { describe, it, expect } from "vitest";
import type { Graph } from "../graph/types";
import type { RouteResult } from "../router";
import type { Exploration } from "../router";
import type { ResolvedEndpoint } from "./resolve";
import { planFromResult, pathToLngLat } from "./routeGeometry";

const graph: Graph = {
  nodes: [
    { id: 0, lat: 39.70, lng: -104.90 },
    { id: 1, lat: 39.71, lng: -104.89 },
    { id: 2, lat: 39.72, lng: -104.88 },
    { id: 3, lat: 39.705, lng: -104.85 },
  ],
  adjacency: new Map(),
};

function ep(role: "origin" | "dest", id: number): ResolvedEndpoint {
  const n = graph.nodes[id];
  return {
    role,
    nodeId: id,
    coord: { lat: n.lat, lng: n.lng },
    input: { lat: n.lat, lng: n.lng },
    label: `node ${id}`,
    snapMeters: 5,
  };
}

function emptyExploration(settledOrder: number[]): Exploration {
  return {
    settledOrder,
    rejectedByNode: new Map(),
    rejectedTotalCount: 0,
    rejectedDetailCount: 0,
    rejectedDetailCapped: false,
    frontier: [],
  };
}

describe("planFromResult", () => {
  it("success → a route line in [lng, lat] order", () => {
    const result: RouteResult = {
      kind: "success",
      path: [0, 1, 2],
      lengthMeters: 2500,
      detourFactor: 1.4,
      exploration: emptyExploration([0, 1, 2]),
    };
    const plan = planFromResult(graph, result, ep("origin", 0), ep("dest", 2));
    expect(plan.kind).toBe("route");
    if (plan.kind !== "route") return;
    expect(plan.line).toEqual([
      [-104.9, 39.7],
      [-104.89, 39.71],
      [-104.88, 39.72],
    ]);
  });

  it("NoBearingLegalPath → red stub (origin → trap) + trap box, no through-line", () => {
    const result: RouteResult = {
      kind: "failure",
      reason: "NoBearingLegalPath",
      exploration: emptyExploration([0, 1, 3]), // deepest settled = node 3 (the trap)
    };
    const plan = planFromResult(graph, result, ep("origin", 0), ep("dest", 2));
    expect(plan.kind).toBe("fault");
    if (plan.kind !== "fault") return;
    expect(plan.trap).toEqual({ lat: 39.705, lng: -104.85 });
    expect(plan.stub).toEqual([
      [-104.9, 39.7], // origin
      [-104.85, 39.705], // trap
    ]);
  });

  it("Disconnected → marks the destination, no stub", () => {
    const result: RouteResult = { kind: "failure", reason: "Disconnected" };
    const plan = planFromResult(graph, result, ep("origin", 0), ep("dest", 2));
    expect(plan.kind).toBe("fault");
    if (plan.kind !== "fault") return;
    expect(plan.stub).toBeNull();
    expect(plan.trap).toEqual({ lat: 39.72, lng: -104.88 });
  });

  it("other reasons (off-network) → nothing to draw", () => {
    const result: RouteResult = { kind: "failure", reason: "OriginOffNetwork" };
    const plan = planFromResult(graph, result, ep("origin", 0), ep("dest", 2));
    expect(plan.kind).toBe("none");
  });

  it("pathToLngLat skips unknown ids defensively", () => {
    expect(pathToLngLat(graph, [0, 99, 2])).toEqual([
      [-104.9, 39.7],
      [-104.88, 39.72],
    ]);
  });
});
