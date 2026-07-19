charlie

# Loose Bearing — Constrained router core (build 3/6)
# Work on one stage at a time. Do NOT combine stages.

---

## Context
Read `NOW.md` first. V1 shipped the geo core and the `isBearingLegal` predicate; V2 shipped the loadable Front Range graph with precomputed edge bearings and lengths, plus the fixtures (`src/graph/fixtures.ts`) built in V1. This log builds the algorithm — headless, fully tested — that turns a (start, end) pair into either a bearing-legal route or a typed failure, along with the captured search state the V5 Reveal animates.

Log 3 of the Loose Bearing build set (V1 → V2 → **V3** → V4 → V5 → V6). V4 wraps this in a map UI; V5 animates the explored set this log captures. There is still **no UI** in this log.

**A route result = either the shortest bearing-legal path (with its captured exploration) or one of five named failures.** The router is a pure function of `(graph, startNode, endNode)`; given the same inputs it must return the identical path AND the identical exploration order, because permalinks and replay in V4/V5 depend on it.

This log builds only the **search, the captured exploration, the failure taxonomy, and the detour metric** over the graph and fixtures. It does **not** geocode, snap, render, or animate (V4/V5). It reads the artifact from V2 but adds no UI.

## Decisions (agreed in the CEO review)
- **Constrained A*, shortest VALID path** — not any-valid-path. The bearing rule gates edge relaxation; cost is distance; the heuristic is straight-line (haversine) distance to the destination, which stays admissible because the constraint only removes edges (never shortens remaining paths).
- **Capture the full explored set** — settle order, per-node rejected edges, and the frontier — as the raw material for the V5 Reveal and the search-stats readout. Bounded/streamable so an unreachable search (which explores maximally) does not blow memory.
- **Deterministic tie-break by node id** in the priority queue. No `Math.random`, no `Date.now`, no dependence on insertion timing. Determinism is a hard requirement, tested explicitly.
- **Full five-state failure taxonomy** (agreed in CEO review D4): `OriginOffNetwork`, `DestinationOffNetwork`, `NoBearingLegalPath` (the feature), `Disconnected`, `GraphLoadError`. `NoBearingLegalPath` is a first-class SUCCESS-of-the-concept result, never conflated with the others. (Geocode-miss is a V4 concern — it happens before we have nodes — but reserve the reason name.)
- **Detour factor** = constrained path length ÷ unconstrained shortest path length; requires running an ordinary shortest-path too. Equals 1.0 when the rule does not bind.
- **Design system:** none (no UI).
- Large-ish system: **six stages.**

---

# Stage 1 — A* baseline (unconstrained) over the real graph

```
Get a correct, ordinary A* working first — the constraint comes next.

1. Create `src/router/astar.ts` exporting `shortestPath(graph, startId, endId): { path: number[]; lengthMeters: number } | null`. Use a binary-heap priority queue, g = accumulated edge length, h = haversineMeters(node, endNode) as the heuristic (import V1 geo core), f = g + h.
2. Break ties deterministically: when f is equal, order by node id. No randomness, no timestamps.
3. Reconstruct the path via a came-from map.

Verify: on `gridGraph` and `disconnectedGraph` fixtures and one real pair from the V2 artifact, the path equals the hand-checked shortest path; `disconnectedGraph` across components returns null. `npm test` green. Report the checked paths.
```

## Stage 1 Report

_Pending._

---

# Stage 2 — Bearing-gated relaxation (the constraint)

```
Add the 90° rule to the search.

1. Create `src/router/constrainedRouter.ts` with a `findConstrainedRoute(graph, startId, endId)` that runs A* like Stage 1 but, when expanding a node, only relaxes an out-edge if `isBearingLegal(edge.bearingDeg, initialBearingDeg(currentNode, endNode))` is true. Recompute bearing-to-destination fresh at each expanded node (it changes as you move). Import the V1 predicate and geo core — do NOT reimplement the angle math.
2. Keep the deterministic node-id tie-break.
3. For now return just the path + length (captured state and typed failures come in Stages 3–4). Return null if the open set empties without settling the destination.

Verify: on `gridGraph`, produced routes contain only legal turns (assert every consecutive edge passes `isBearingLegal` against its own bearing-to-dest). On `trapGraph` toward the trapped target, the function returns null (destination is bearing-unreachable). Report a legal route and the trap null.
```

## Stage 2 Report

_Pending._

---

# Stage 3 — Capture the explored set

```
Record the search's scratch work — this is what V5 animates.

1. Extend the constrained router to build an `Exploration` record: settled nodes in settle order, and for each expanded node the edges it REJECTED for failing the bearing rule (with each rejected edge's bearing and target), plus the final frontier at termination.
2. Make capture bounded/streamable: an unreachable search explores the entire reachable-under-rule region (worst case = common case for the feature), so cap or chunk the stored rejected-edge detail with a documented limit, and record total counts even when detail is thinned.
3. Return an object `{ result, exploration }` — do not change the pathfinding logic, only observe it.

Verify: on a small fixture the captured settle count and rejected-edge counts match a hand trace. On a real unreachable pair the exploration is large but memory stays bounded to the documented cap. Report captured counts for one reachable and one unreachable case.
```

## Stage 3 Report

_Pending._

---

# Stage 4 — The five-state typed result

```
Make every outcome a named, distinguishable result — protecting "unreachable is a feature".

1. Create `src/router/result.ts` with a discriminated union `RouteResult = Success | Failure`, where `Failure.reason` is one of `OriginOffNetwork | DestinationOffNetwork | NoBearingLegalPath | Disconnected | GraphLoadError`. `Success` carries the path, length, and the `Exploration` from Stage 3.
2. Have the router distinguish, in order: start/end node missing from the graph → Origin/DestinationOffNetwork; destination unreachable even by ordinary (unconstrained) A* → Disconnected; destination reachable unconstrained but the constrained search exhausts → NoBearingLegalPath. (GraphLoadError is raised by the loader, not the search, but define the reason here.) The key rule: NoBearingLegalPath is returned ONLY when an ordinary path exists but the bearing rule blocks it.
3. Reserve the `GeocodeMiss` naming note for V4 in a comment (it occurs before nodes exist).

Verify: construct a targeted fixture for each of the four search-time states and assert the exact reason returned. Critically assert that a `disconnectedGraph` pair returns `Disconnected`, NOT `NoBearingLegalPath`. Report all four mappings.
```

## Stage 4 Report

_Pending._

---

# Stage 5 — Detour factor

```
Compute how strange the constrained route is versus normal — the headline number.

1. Add detour computation: on a constrained Success, also run the Stage 1 unconstrained `shortestPath` and set `detourFactor = constrainedLength / unconstrainedLength`. Attach it to the Success result. If unconstrained length is ~0 (origin == dest) handle gracefully (factor 1).
2. Ensure both searches use the same start/end nodes and the same graph so the ratio is honest (shortest-constrained vs shortest-unconstrained).

Verify: on a hand-built graph with a known constrained detour, the factor matches the hand calculation. On `gridGraph` where the rule does not bind, the factor is ~1.0. Report both.
```

## Stage 5 Report

_Pending._

---

# Stage 6 — Router test suite, coherence, update NOW.md (the safety net)

```
Lock the algorithm behind tests and record it done.

1. Create `src/router/constrainedRouter.test.ts` consolidating: shortest-valid-path correctness on a fixture; trap → NoBearingLegalPath; disconnected → Disconnected; determinism — run the SAME (start,end) twice and assert identical path AND identical settle order of the exploration; taxonomy — each reason reachable; detour factor known-value + non-binding ~1.0.
2. Add a determinism guard test that would fail if any nondeterminism (unstable tie-break, Set iteration order, randomness) crept in. Grep the router for `Math.random` / `Date.now` and assert none in the search path.
3. Run full `npm run typecheck`, `npm test`, `npm run build`. All green.
4. Update `NOW.md`: move "Router" to functional with the V3 tag and a one-line note that the router returns `{ result, exploration }` with a five-state taxonomy and is deterministic, so V4/V5 can rely on it.

Verify: full suite green including the determinism guard; typecheck clean. Report the determinism test result and a one-paragraph summary of what V3 now guarantees for V4/V5.
```

## Stage 6 Report

_Pending._

---

# After These Stages
- The constrained router is real, deterministic, and fully tested: it returns the shortest bearing-legal route with a detour factor and a captured exploration, or one of five named failures — with `NoBearingLegalPath` cleanly separated from ordinary errors.
- Explicitly still deferred (see `NOW.md`): geocoding + snapping + pins + rendering (V4), the animated Reveal over the captured exploration (V5), and the gallery/failure-state UIs + ship (V6).
- Next major build: **V4 — the map shell and static routing UI** (MapLibre base, load the V2 artifact, geocode + snap, draw the constrained route + ghosts + detour readout, and permalinks). After V4–V6 are agreed, we will scaffold those logs.
