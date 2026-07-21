// The query lifecycle (V4, Stage 4). Owns the current (origin, dest) endpoints and turns any
// change to either into at most one live route job, with strict "latest wins" semantics:
//   - Every mutation bumps a generation counter and aborts the previous in-flight job, so a
//     burst of rapid clicks/drags collapses to a single search for the FINAL pair — no races,
//     no stale/flashing result. A completed job whose generation is no longer current is
//     dropped rather than emitted.
//   - `origin === dest` (same snapped node) is a trivial zero-length case: emitted directly as
//     `trivial`, never sent through the router (no misleading through-line, no wasted search).
//   - A missing endpoint is `idle`.
//
// The actual routing is injected as a `RouteRunner` (async, abortable) so this controller is a
// pure state machine, testable without the 1.4 M-node graph. Stage 5 plugs in V3's `route()`
// (deferred behind a microtask so superseded jobs never start the heavy sync search) and makes
// the `routed` outcome draw the route.

import type { RouteResult } from "../router";
import type { ResolvedEndpoint } from "./resolve";

export type QueryOutcome =
  | { kind: "idle" }
  | { kind: "pending"; origin: ResolvedEndpoint; dest: ResolvedEndpoint }
  | { kind: "trivial"; endpoint: ResolvedEndpoint }
  | { kind: "routed"; result: RouteResult; origin: ResolvedEndpoint; dest: ResolvedEndpoint };

/** Runs one search for a node-id pair. Must reject (AbortError) if `signal` aborts. */
export type RouteRunner = (
  startId: number,
  endId: number,
  signal: AbortSignal,
) => Promise<RouteResult>;

export class QueryController {
  private origin: ResolvedEndpoint | null = null;
  private dest: ResolvedEndpoint | null = null;
  private generation = 0;
  private inFlight: AbortController | null = null;

  constructor(
    private readonly runner: RouteRunner,
    private readonly onOutcome: (outcome: QueryOutcome) => void,
  ) {}

  getOrigin(): ResolvedEndpoint | null {
    return this.origin;
  }
  getDest(): ResolvedEndpoint | null {
    return this.dest;
  }

  setEndpoint(role: "origin" | "dest", endpoint: ResolvedEndpoint | null): void {
    if (role === "origin") this.origin = endpoint;
    else this.dest = endpoint;
    this.kick();
  }

  /** Force a re-evaluation (e.g. after the graph finishes loading). */
  refresh(): void {
    this.kick();
  }

  private kick(): void {
    const gen = ++this.generation;
    // Any prior job is now stale — cancel it so it can't run heavy work or emit.
    this.inFlight?.abort();
    this.inFlight = null;

    const { origin, dest } = this;
    if (!origin || !dest) {
      this.onOutcome({ kind: "idle" });
      return;
    }
    if (origin.nodeId === dest.nodeId) {
      // Same snapped node — trivial zero-length, never routed.
      this.onOutcome({ kind: "trivial", endpoint: origin });
      return;
    }

    this.onOutcome({ kind: "pending", origin, dest });

    const ctrl = new AbortController();
    this.inFlight = ctrl;
    this.runner(origin.nodeId, dest.nodeId, ctrl.signal)
      .then((result) => {
        if (gen !== this.generation) return; // superseded between scheduling and completion
        this.inFlight = null;
        this.onOutcome({ kind: "routed", result, origin, dest });
      })
      .catch((err) => {
        if (gen !== this.generation) return; // superseded — drop silently
        if ((err as { name?: string })?.name === "AbortError") return;
        this.inFlight = null;
        // Unexpected runner error: surface as idle so the UI doesn't hang on "pending".
        this.onOutcome({ kind: "idle" });
      });
  }
}
