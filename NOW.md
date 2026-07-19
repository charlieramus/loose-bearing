# NOW — Loose Bearing build state

The orientation doc. Every later updatelog reads this first. Keep it current.

## State

| Area         | State       | Log |
| ------------ | ----------- | --- |
| Geo core     | done        | V1  |
| OSM pipeline | not started | V2  |
| Router       | not started | V3  |
| Map UI       | not started | V4  |
| The Reveal   | not started | V5  |
| Gallery/ship | not started | V6  |

**Geo core (V1):** tested, single-source-of-truth geometry — `src/geo/geo.ts` (haversine
distance, `atan2` initial bearing, `angularDiffDeg`) and the one `isBearingLegal` predicate
in `src/geo/bearingRule.ts` (90° inclusive, epsilon-stable). Graph model (`src/graph/types.ts`)
plus three hand-built fixtures (grid / trap / disconnected) that V2–V3 test against. 32 tests
green; no duplicated angle/distance math.

## Direction (locked in CEO review — do not relitigate)

- **Region = Front Range.** Colorado Front Range streets only; not a general-purpose router.
- **Strict enforcement, no escape hatch.** The 90° bearing rule is absolute — no "relax the
  constraint" mode. Unreachable is a feature.
- **Custom graph, not OSRM/Valhalla.** We build our own compact directed graph offline (V2)
  rather than depending on a general routing engine.
- **Web via MapLibre.** The eventual UI (V4+) renders on the web with MapLibre GL.
