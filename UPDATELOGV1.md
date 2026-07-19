charlie

# Loose Bearing — Foundations & the geo core (build 1/6)
# Work on one stage at a time. Do NOT combine stages.

---

## Context
This is the first log — the repo does not exist yet, and there is **no `NOW.md`** (Stage 1 creates it). Loose Bearing is a bearing-constrained wayfinding toy: it routes between two points on real Front Range streets but only ever takes turns that keep your heading within 90° of the direct bearing to the destination. "Unreachable" is a valid, expected result, not a bug.

Log 1 of the Loose Bearing build set (V1 → V2 → V3 → V4 → V5 → V6). V2 builds the offline OSM graph pipeline, V3 the constrained router, V4 the map shell, V5 the animated Reveal (the hero), V6 the gallery + failure states + ship.

**The bearing rule = a turn is legal iff the edge's bearing is within 90° (inclusive) of the bearing from the current node to the destination.** This is the single idea the whole product rests on, and this log builds the one authoritative implementation of the math behind it.

This log builds only the **repo skeleton and the geo core** (distance, bearing, the rule predicate, graph types, and test fixtures). It does **not** parse any OSM data (V2), implement any search (V3), or render any UI (V4+) — those live in their own logs. Nothing here touches the network or the filesystem beyond the repo.

## Decisions (agreed in the CEO review)
- **Stack:** Vite + TypeScript, `vitest` for tests. No framework decision forced yet (the app shell arrives in V4); keep V1 framework-agnostic under `src/`.
- **Geo math is spherical and shared:** haversine distance + `atan2` initial bearing, in ONE module (`src/geo/geo.ts`). The bearing rule must never be reimplemented anywhere else — every later stage imports it. This is the top DRY invariant of the project.
- **The predicate is inclusive of exactly 90°,** epsilon-stable, so boundary cases are deterministic.
- **Determinism is a downstream hard requirement** (permalinks + replay depend on it). Foundations are pure, side-effect-free, no `Math.random`, no `Date.now` in any core path.
- **Real now:** the geo core and fixtures ship as real, fully-tested code.
- **Locked / deferred:** OSM data, routing, UI, and any design system are explicitly out — no stubs that pretend to route.
- **Design system:** none yet. Deferred to V6. This log has no UI, so no `DESIGN.md` is needed; do not invent one.
- **`NOW.md`** is created in Stage 1 as the build-state doc every later log reads first.
- Medium feature: **five stages.**

---

# Stage 1 — Repo skeleton, tooling, and NOW.md

```
Set up the Loose Bearing project from an empty folder.

1. Run `git init`. Create a Vite + TypeScript project in place (vanilla-ts template is fine — the map app shell comes later in V4, so do NOT pick a heavy framework now).
2. Add `vitest` and wire an `npm test` script. Add `tsc --noEmit` as a `typecheck` script and `npm run build` (vite build) as the build script.
3. Create the source layout (empty index files with a one-line comment each are fine): `src/geo/`, `src/graph/`, `src/router/`, `src/app/`, and a top-level `build/` for offline scripts (V2 fills it). Add `public/` for static artifacts.
4. Add `.gitignore` covering `node_modules`, `dist`, `public/graph/` (the built graph artifact from V2 — generated, not committed), and **`UPDATELOG*`** (the staged build docs stay local and are NEVER pushed — the code ships, the plans do not). `NOW.md` is NOT ignored; it is tracked build state.
5. Write `README.md` with the concept in 3–4 sentences (the bearing rule, the Front Range scope, "unreachable is a feature"), and a "Build log" line pointing at the UPDATELOGV*.md sequence.
6. Create `NOW.md` at the repo root: a build-state table (columns: Area | State | Log) seeded with rows for Geo core (in progress, V1), OSM pipeline (not started, V2), Router (not started, V3), Map UI (not started, V4), The Reveal (not started, V5), Gallery/ship (not started, V6); plus a short "Direction" section restating the four locked decisions from the CEO plan (region = Front Range, strict enforcement no escape hatch, custom graph over OSRM/Valhalla, web via MapLibre) so future logs do not relitigate them.

Verify: `npm run typecheck`, `npm test` (an empty/placeholder suite passing is fine), and `npm run build` all succeed on a clean clone. Report the tree of created files and confirm NOW.md exists at the root.
```

## Stage 1 Report

_Pending._

---

# Stage 2 — Geo primitives (pure functions)

```
Build the shared spherical-geometry module — the single source of truth for all distance and bearing math.

1. Create `src/geo/geo.ts` exporting pure functions:
   - `haversineMeters(a: LatLng, b: LatLng): number` — great-circle distance.
   - `initialBearingDeg(a: LatLng, b: LatLng): number` — the initial great-circle bearing from a to b, via atan2, normalized to [0, 360).
   - `angularDiffDeg(from: number, to: number): number` — smallest absolute difference between two compass bearings, in [0, 180].
   - Define and export a `LatLng` type (`{ lat: number; lng: number }`).
2. No side effects, no Math.random, no Date. Everything deterministic and referentially transparent.
3. Create `src/geo/geo.test.ts` with vitest covering: a known distance (e.g. two coordinates a known number of meters apart, within tolerance), cardinal bearings (due north ≈ 0, due east ≈ 90, due south ≈ 180, due west ≈ 270), the 0/360 wraparound (bearings just east and just west of north differ correctly via angularDiffDeg), and an antipodal-ish sanity case.

Verify: `npm test` green with these cases; `npm run typecheck` clean. Report each assertion and its computed value.
```

## Stage 2 Report

_Pending._

---

# Stage 3 — The bearing rule predicate

```
Implement THE rule — the one function that defines what makes a turn legal. Everything downstream imports this; it is never reimplemented.

1. Create `src/geo/bearingRule.ts` exporting:
   - `isBearingLegal(edgeBearingDeg: number, bearingToDestDeg: number, opts?: { epsilonDeg?: number }): boolean` — true iff `angularDiffDeg(edgeBearingDeg, bearingToDestDeg) <= 90 + epsilon`. Default epsilon is a tiny value (e.g. 1e-9) so EXACTLY 90° is legal and float noise at the boundary is stable.
   - A small doc comment stating the rule in English and that inclusivity of 90° is intentional (a perpendicular turn is allowed; only turns that point back toward where you came from are illegal).
2. Reuse `angularDiffDeg` from `src/geo/geo.ts` — do not recompute angle math here.
3. Create `src/geo/bearingRule.test.ts`: legal at 0° diff, legal at 89.9°, legal at EXACTLY 90.0°, illegal at 90.1°, illegal at 180°, and a wraparound case (edge bearing 350°, dest bearing 20° → 30° diff → legal).

Verify: `npm test` green; the exactly-90° case passes as legal. `npm run typecheck` clean. Report the boundary cases explicitly.
```

## Stage 3 Report

_Pending._

---

# Stage 4 — Graph types + test fixtures

```
Define the graph data model and hand-built fixture graphs. These fixtures are the ground truth for every router test in V3, so build them deliberately.

1. Create `src/graph/types.ts`:
   - `Node` = `{ id: number; lat: number; lng: number }`.
   - `DirectedEdge` = `{ from: number; to: number; bearingDeg: number; lengthMeters: number }` (bearing precomputed at build time in V2; fixtures set it directly).
   - `Graph` = nodes plus an adjacency structure (`Map<number, DirectedEdge[]>` keyed by from-node). Include a helper `outEdges(graph, nodeId): DirectedEdge[]`.
2. Create `src/graph/fixtures.ts` exporting three graphs built by hand (compute bearings/lengths with `src/geo/geo.ts` so they are internally consistent):
   - `gridGraph` — a small rectangular street grid (e.g. 4×4 nodes) with two directed edges per street segment. On a grid most destinations are reachable under the rule; this is the "normal-ish route" fixture.
   - `trapGraph` — a small graph where, from some interior node, EVERY out-edge points more than 90° away from a chosen destination, so the destination is bearing-unreachable even though it is graph-connected. This is the fixture that must produce NoBearingLegalPath in V3.
   - `disconnectedGraph` — two components with no edges between them, so a destination is unreachable regardless of the rule (feeds the Disconnected state in V3).
3. Add `src/graph/fixtures.test.ts` asserting each fixture's node/edge counts and one hand-checked adjacency per fixture, and asserting `trapGraph` really has all-illegal exits toward its target node (using `isBearingLegal`) while remaining connected.

Verify: `npm test` green; the trap fixture's illegality is asserted with the real predicate, not hardcoded. `npm run typecheck` clean. Report the three fixtures' shapes.
```

## Stage 4 Report

_Pending._

---

# Stage 5 — Coherence + Verify

```
Prove the foundation is whole and record it.

1. Run the full `npm run typecheck`, `npm test`, and `npm run build`. Everything green from a clean state.
2. Do a literal walkthrough: import `isBearingLegal` and the geo functions in a scratch check (or a dedicated test) and confirm a legal and an illegal turn on `gridGraph` behave as expected end to end.
3. Confirm the DRY invariant: grep the codebase to prove the 90° comparison and the bearing/haversine math exist in exactly one place each (`geo.ts` / `bearingRule.ts`). Report any duplication and remove it.
4. Update `NOW.md`: move "Geo core" to a functional/done state with a one-line summary and the V1 tag; leave the rest as-is.

Verify: full suite green; NOW.md updated; a one-paragraph summary of what V1 now guarantees (a tested, single-source geo core and fixtures) so V2/V3 can build on it without re-checking the math.
```

## Stage 5 Report

_Pending._

---

# After These Stages
- The project has a tested, single-source-of-truth geo core: distance, initial bearing, and **the** 90° rule predicate, plus three deliberate fixture graphs (grid, trap, disconnected) that later logs test against.
- Explicitly still deferred (see `NOW.md`): all OSM data and graph building (V2), all search/routing (V3), and every pixel of UI (V4+).
- Next major build: **V2 — the offline OSM graph pipeline**, which turns a Front Range extract into a compact, loadable, validated directed graph using this geo core to precompute edge bearings.
