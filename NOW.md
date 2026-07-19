# NOW — Loose Bearing build state

The orientation doc. Every later updatelog reads this first. Keep it current.

## State

| Area         | State       | Log |
| ------------ | ----------- | --- |
| Geo core     | in progress | V1  |
| OSM pipeline | not started | V2  |
| Router       | not started | V3  |
| Map UI       | not started | V4  |
| The Reveal   | not started | V5  |
| Gallery/ship | not started | V6  |

## Direction (locked in CEO review — do not relitigate)

- **Region = Front Range.** Colorado Front Range streets only; not a general-purpose router.
- **Strict enforcement, no escape hatch.** The 90° bearing rule is absolute — no "relax the
  constraint" mode. Unreachable is a feature.
- **Custom graph, not OSRM/Valhalla.** We build our own compact directed graph offline (V2)
  rather than depending on a general routing engine.
- **Web via MapLibre.** The eventual UI (V4+) renders on the web with MapLibre GL.
