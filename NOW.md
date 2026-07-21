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
- **Design reference (LOCKED).** The app's visual language is the Loose Bearing mockup
  (reference artifact: https://claude.ai/code/artifact/cb5623a2-70bf-476e-8c60-c05ac6c5a0c4).
  Teenage-Engineering instrument style: concrete-grey/ink body; monospace readouts with a
  light large-grotesque hero figure; hairline grid + corner registration marks; ONE green
  signal color (red = fault only); zero explanatory captions/legends; light + dark. No UI in
  V1 — but V4+ inherit this exactly. When UI work begins, promote this to a full `DESIGN.md`.
