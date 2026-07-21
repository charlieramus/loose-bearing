# NOW — Loose Bearing build state

The orientation doc. Every later updatelog reads this first. Keep it current.

## State

| Area         | State       | Log |
| ------------ | ----------- | --- |
| Geo core     | done        | V1  |
| OSM pipeline | functional  | V2  |
| Router       | functional  | V3  |
| Map UI       | functional  | V4  |
| The Reveal   | not started | V5  |
| Gallery/ship | not started | V6  |

**Geo core (V1):** tested, single-source-of-truth geometry — `src/geo/geo.ts` (haversine
distance, `atan2` initial bearing, `angularDiffDeg`) and the one `isBearingLegal` predicate
in `src/geo/bearingRule.ts` (90° inclusive, epsilon-stable). Graph model (`src/graph/types.ts`)
plus three hand-built fixtures (grid / trap / disconnected) that V2–V3 test against. 32 tests
green; no duplicated angle/distance math.

**OSM pipeline (V2):** offline `build/` scripts (01→06, reproducible; `build/README.md`) turn a
checksum-pinned Geofabrik Colorado extract into a directed Front Range street graph. Result:
`public/graph/frontrange.graph.json` — **1,426,625 nodes / 3,631,737 edges**, edges carry
precomputed bearing + length; snapping grid rebuilt at load (`build/spatial.ts`), artifact schema
+ loader in `build/serialize.ts` (V4 imports it). Size **99.9 MB raw / 31.1 MB gzipped → load
CLIENT-SIDE, zero backend** (V4 need not re-measure). Validation clean: one dominant weakly-
connected component (97.4%), 0.04% dead sinks, grid-shaped bearing histogram. Both `build/data/`
and `public/graph/` are gitignored — regenerate via `build/` run order. Deferred to later logs:
the search itself (V3) and loading the artifact into a running app (V4).

**Router (V3):** headless, deterministic, fully tested — `src/router/` (import from `src/router/index.ts`).
`route(graph, startId, endId)` returns `{ result, exploration }` as a five-state typed `RouteResult`:
a `Success` (shortest bearing-legal path + length + `detourFactor` + captured `Exploration`) or a
named `Failure` (`OriginOffNetwork | DestinationOffNetwork | NoBearingLegalPath | Disconnected |
GraphLoadError`), with `NoBearingLegalPath` — the feature — cleanly separated from ordinary errors
(only returned when an unconstrained path exists). Constrained A* over the V1 geo core + the one
`isBearingLegal` predicate; deterministic node-id tie-break (guarded — identical path AND settle
order across runs, no `Math.random`/`Date.now`); exploration capture bounded to
`MAX_REJECTED_DETAIL = 50k` for the V5 Reveal. 65 tests green. V4/V5 can rely on identical results
and exploration order for permalinks/replay.

**Map UI (V4):** the app is real — `src/app/` on MapLibre GL, in the locked instrument style
(header + left control column + framed map "screen"; concrete/ink; CARTO Positron/Dark-Matter
monochrome basemap tinted to the ground; light + dark). It statically renders a bearing-constrained
route: type or click two points → the graph loads CLIENT-SIDE (`graphLoader`, V2 artifact, cached),
addresses geocode (Nominatim, debounced) and snap to nodes (`snap`/V2 grid), the query lifecycle
(`queryController`, latest-wins + zero-length) runs V3's `route()`, and the result renders as ONE
green route line against a thin dotted A→B **direct** reference line (no ghost path, no on-map cone)
plus the instrument **readout** (detour hero figure + 16-seg meter + DISTANCE/DIRECT/NODES/REFUSED,
→ DEAD ENDS on a fault) and the compass + BEARING. All five failure states are honest and distinct
(GraphLoadError, GeocodeMiss, Origin/DestinationOffNetwork, **NO PATH** for NoBearingLegalPath,
Disconnected). Every route is a deterministic **permalink** (`#a=…&b=…`, clamped to the shared
Front-Range bbox now lifted to `src/geo/region.ts`). The map render is a **pure function of the
router result** (`routeGeometry` → `RouteRenderer`) so V5 layers the animated Reveal on the same
captured exploration without rework. DRY invariant holds and is now guarded by a test: the app never
recomputes bearings/distances/legality — it imports the V1 geo core + V3 router. 116 tests green.

## Direction (locked in CEO review — do not relitigate)

- **Region = Front Range.** Colorado Front Range streets only; not a general-purpose router.
- **Strict enforcement, no escape hatch.** The 90° bearing rule is absolute — no "relax the
  constraint" mode. Unreachable is a feature.
- **Custom graph, not OSRM/Valhalla.** We build our own compact directed graph offline (V2)
  rather than depending on a general routing engine.
- **Web via MapLibre.** The eventual UI (V4+) renders on the web with MapLibre GL.
- **Design reference (LOCKED).** The app's visual language is the Loose Bearing mockup
  (reference artifact: https://claude.ai/code/artifact/cb5623a2-70bf-476e-8c60-c05ac6c5a0c4).
  Teenage-Engineering instrument style: concrete-grey/ink body; monospace readouts with a
  light large-grotesque hero figure; hairline grid + corner registration marks; ONE green
  signal color (red = fault only); zero explanatory captions/legends; light + dark. No UI in
  V1 — but V4+ inherit this exactly. When UI work begins, promote this to a full `DESIGN.md`.
