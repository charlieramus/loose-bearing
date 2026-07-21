// Stage 5 verification (end-to-end): the REAL V3 router → the render plan. Uses V3's own
// fixtures so we exercise the actual `route()` output, not a synthetic one:
//   - detourGraph: the bearing rule binds → a Success whose detour factor > 1 → a green route
//     line that is genuinely longer/odder than the direct hop (the "sometimes looks odd" case);
//   - trapGraph: NoBearingLegalPath → a fault plan (stub + trap), NOT a drawn through-line;
//   - disconnectedGraph: Disconnected → a fault plan marking the destination.

import { describe, it, expect } from "vitest";
import { route } from "../router";
import type { Graph } from "../graph/types";
import {
  detourGraph,
  DETOUR_START,
  DETOUR_DEST,
  trapGraph,
  TRAP_START_NODE,
  TRAP_DEST_NODE,
  disconnectedGraph,
} from "../graph/fixtures";
import { planFromResult } from "./routeGeometry";
import type { ResolvedEndpoint } from "./resolve";

function ep(role: "origin" | "dest", graph: Graph, id: number): ResolvedEndpoint {
  const n = graph.nodes.find((x) => x.id === id)!;
  return {
    role,
    nodeId: id,
    coord: { lat: n.lat, lng: n.lng },
    input: { lat: n.lat, lng: n.lng },
    label: `node ${id}`,
    snapMeters: 0,
  };
}

describe("router → render plan (fixtures)", () => {
  it("detour (rule binds): success draws a green route line with detour > 1", () => {
    const result = route(detourGraph, DETOUR_START, DETOUR_DEST);
    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.detourFactor).toBeGreaterThan(1); // the constrained route is genuinely longer
    // It took the legal detour S→N→D, not the illegal direct S→W→D.
    expect(result.path).toEqual([0, 3, 1]);

    const plan = planFromResult(
      detourGraph,
      result,
      ep("origin", detourGraph, DETOUR_START),
      ep("dest", detourGraph, DETOUR_DEST),
    );
    expect(plan.kind).toBe("route");
    if (plan.kind !== "route") return;
    expect(plan.line).toHaveLength(3);
  });

  it("trap: NoBearingLegalPath draws a fault (no through-line)", () => {
    const result = route(trapGraph, TRAP_START_NODE, TRAP_DEST_NODE);
    expect(result.kind).toBe("failure");
    if (result.kind !== "failure") return;
    expect(result.reason).toBe("NoBearingLegalPath");

    const plan = planFromResult(
      trapGraph,
      result,
      ep("origin", trapGraph, TRAP_START_NODE),
      ep("dest", trapGraph, TRAP_DEST_NODE),
    );
    expect(plan.kind).toBe("fault"); // never a "route" — no fake through-line
    if (plan.kind !== "fault") return;
    expect(plan.trap).not.toBeNull();
  });

  it("disconnected: Disconnected draws a fault marking the destination", () => {
    const result = route(disconnectedGraph, 0, 2);
    expect(result.kind).toBe("failure");
    if (result.kind !== "failure") return;
    expect(result.reason).toBe("Disconnected");

    const plan = planFromResult(
      disconnectedGraph,
      result,
      ep("origin", disconnectedGraph, 0),
      ep("dest", disconnectedGraph, 2),
    );
    expect(plan.kind).toBe("fault");
    if (plan.kind !== "fault") return;
    expect(plan.stub).toBeNull();
    expect(plan.trap).toEqual({ lat: 40.1, lng: -105.1 });
  });
});
