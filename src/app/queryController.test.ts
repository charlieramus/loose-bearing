// Stage 4 verification: the query lifecycle. Proves latest-wins (a burst of endpoint changes
// yields exactly one routed result — the final pair — with superseded jobs dropped), the
// origin === dest trivial zero-length short-circuit (never routed), and idle on a missing
// endpoint. Uses a mock runner so it exercises the state machine, not the 1.4 M-node graph.

import { describe, it, expect } from "vitest";
import { QueryController, type QueryOutcome, type RouteRunner } from "./queryController";
import type { ResolvedEndpoint } from "./resolve";
import type { RouteResult } from "../router";

function ep(nodeId: number): ResolvedEndpoint {
  return {
    role: "origin",
    nodeId,
    coord: { lat: 39.7, lng: -104.9 },
    input: { lat: 39.7, lng: -104.9 },
    label: `node ${nodeId}`,
    snapMeters: 10,
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

// Resolves after a microtask; honors abort so a superseded job rejects.
const mockRunner: RouteRunner = async (_s, _e, signal) => {
  await Promise.resolve();
  if (signal.aborted) throw new DOMException("aborted", "AbortError");
  return { kind: "failure", reason: "NoBearingLegalPath" } as RouteResult;
};

describe("QueryController", () => {
  it("is idle until both endpoints are set", () => {
    const seen: QueryOutcome[] = [];
    const qc = new QueryController(mockRunner, (o) => seen.push(o));
    qc.setEndpoint("origin", ep(1));
    expect(seen.at(-1)?.kind).toBe("idle");
  });

  it("treats origin === dest as a trivial zero-length case (never routed)", async () => {
    const seen: QueryOutcome[] = [];
    const qc = new QueryController(mockRunner, (o) => seen.push(o));
    qc.setEndpoint("origin", ep(5));
    qc.setEndpoint("dest", ep(5));
    await flush();
    expect(seen.at(-1)?.kind).toBe("trivial");
    expect(seen.some((o) => o.kind === "routed")).toBe(false);
  });

  it("routes a distinct pair", async () => {
    const seen: QueryOutcome[] = [];
    const qc = new QueryController(mockRunner, (o) => seen.push(o));
    qc.setEndpoint("origin", ep(1));
    qc.setEndpoint("dest", ep(2));
    await flush();
    const last = seen.at(-1);
    expect(last?.kind).toBe("routed");
  });

  it("latest wins: a burst collapses to one routed result for the final pair", async () => {
    const seen: QueryOutcome[] = [];
    const qc = new QueryController(mockRunner, (o) => seen.push(o));
    qc.setEndpoint("origin", ep(1));
    qc.setEndpoint("dest", ep(2));
    qc.setEndpoint("dest", ep(3));
    qc.setEndpoint("dest", ep(4)); // rapid re-clicks
    await flush();

    const routed = seen.filter((o) => o.kind === "routed");
    expect(routed).toHaveLength(1);
    if (routed[0]?.kind !== "routed") return;
    expect(routed[0].dest.nodeId).toBe(4); // the final pair, not a stale one
  });

  it("returns to idle when an endpoint is cleared", async () => {
    const seen: QueryOutcome[] = [];
    const qc = new QueryController(mockRunner, (o) => seen.push(o));
    qc.setEndpoint("origin", ep(1));
    qc.setEndpoint("dest", ep(2));
    await flush();
    qc.setEndpoint("dest", null);
    expect(seen.at(-1)?.kind).toBe("idle");
  });
});
