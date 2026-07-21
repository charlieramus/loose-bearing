import { describe, it, expect } from "vitest";
import { route } from "./result";
import {
  gridGraph,
  trapGraph,
  disconnectedGraph,
  TRAP_START_NODE,
  TRAP_DEST_NODE,
} from "../graph/fixtures";

describe("route — the five-state typed result", () => {
  it("Success: a bearing-legal grid route carries path, length, and exploration", () => {
    const r = route(gridGraph, 0, 15);
    expect(r.kind).toBe("success");
    if (r.kind !== "success") throw new Error("unreachable");
    expect(r.path).toEqual([0, 4, 8, 12, 13, 14, 15]);
    expect(r.lengthMeters).toBeGreaterThan(0);
    expect(r.exploration.settledOrder.length).toBeGreaterThan(0);
  });

  it("OriginOffNetwork: start node absent from the graph", () => {
    const r = route(gridGraph, 9999, 15);
    expect(r).toMatchObject({ kind: "failure", reason: "OriginOffNetwork" });
  });

  it("DestinationOffNetwork: end node absent from the graph", () => {
    const r = route(gridGraph, 0, 9999);
    expect(r).toMatchObject({ kind: "failure", reason: "DestinationOffNetwork" });
  });

  it("Disconnected: no ordinary path exists across components", () => {
    const r = route(disconnectedGraph, 0, 2);
    expect(r).toMatchObject({ kind: "failure", reason: "Disconnected" });
  });

  it("NoBearingLegalPath: ordinary path exists but the 90° rule blocks it", () => {
    const r = route(trapGraph, TRAP_START_NODE, TRAP_DEST_NODE);
    expect(r.kind).toBe("failure");
    if (r.kind !== "failure") throw new Error("unreachable");
    expect(r.reason).toBe("NoBearingLegalPath");
    // The failed search's exploration comes back for V5 to animate.
    expect(r.exploration).toBeDefined();
    expect(r.exploration!.settledOrder).toEqual([TRAP_START_NODE]);
  });

  it("CRITICAL: a disconnected pair is Disconnected, NOT NoBearingLegalPath", () => {
    // These must never be conflated — Disconnected is an ordinary error, NoBearingLegalPath
    // is the feature. The disconnected fixture has no ordinary path at all.
    const r = route(disconnectedGraph, 0, 2);
    expect(r).toMatchObject({ kind: "failure" });
    if (r.kind !== "failure") throw new Error("unreachable");
    expect(r.reason).toBe("Disconnected");
    expect(r.reason).not.toBe("NoBearingLegalPath");
  });

  it("origin check wins when BOTH endpoints are missing (checked in order)", () => {
    const r = route(gridGraph, 9999, 8888);
    expect(r).toMatchObject({ kind: "failure", reason: "OriginOffNetwork" });
  });
});
