charlie

# Loose Bearing — Map shell & static routing UI (build 4/6)
# Work on one stage at a time. Do NOT combine stages.

---

## Context
Read `NOW.md` first. V1 shipped the geo core + rule predicate; V2 shipped the loadable Front Range graph (with the recorded artifact size and the client-vs-serverless recommendation) plus the snapping index; V3 shipped the deterministic constrained router returning `{ result, exploration }` with the five-state taxonomy and a detour factor. This log makes it an actual app: type or click two points, see the constrained route, the ghosts, the number, and a shareable link. Static rendering only — no animation.

Log 4 of the Loose Bearing build set (V1 → V2 → V3 → **V4** → V5 → V6). V5 layers the animated Reveal on top of the same captured exploration this log renders statically; V6 adds the gallery, the designed failure states, and ship.

**The app = a MapLibre map where a (start, end) pair produces a drawn constrained route, a ghosted true-shortest path, a beeline, a detour-factor readout, and a permalink that reproduces it exactly.**

This log builds only the **map shell and static routing UI**. It does **not** animate the search (V5), build the greatest-hits gallery, or design the per-failure-state screens beyond a minimal correct message (V6). It consumes V3's router unchanged.

## Decisions (agreed in the CEO review)
- **MapLibre GL JS** for the map (locked). Front Range default view.
- **Load strategy follows V2/Stage 5's recorded size:** client-side load if the artifact fits (preferred — zero backend, permalinks are pure static), else a thin serverless fetch. Read the recommendation from `NOW.md`; do not re-measure.
- **Permalink is the share mechanism** (CEO review D3): `(start, end)` in the URL fully determines the result because V3 is deterministic. Coordinates are clamped/validated to the Front Range bbox on load.
- **Re-query semantics:** cancel in-flight, latest wins. `origin == dest` is a trivial zero-length case, handled, not animated.
- **Failure taxonomy is honored** (D4): each of the five states shows a distinct, correct message even in this log — the *designed* per-state screens are polished in V6, but they must never be conflated here. `GeocodeMiss` is added here (it happens before we have nodes).
- **Design system:** none committed yet. Keep V4 clean and functional; the signature visual (the 90° cone) arrives in V5. **Recommend running `/plan-design-review` before V5.** No AI-slop UI, no gradients, OSM/ODbL attribution visible (from V2 PROVENANCE).
- Large system: **eight stages.**

---

# Stage 1 — MapLibre base map + app shell

```
Stand up the map and the page layout.

1. Add `maplibre-gl`. Create `src/app/main.ts` mounting a map into `#map` in `index.html`, centered on the Front Range with a sensible default zoom. Use a free/OSS raster or vector style (document the source; keep the ODbL/attribution control visible).
2. Lay out the shell: the map fills the viewport; reserve a small control panel region (for inputs + the detour readout, filled in later stages) and a footer with data attribution.
3. No routing yet — just a stable, resizable map with attribution.

Verify: `npm run build` succeeds; the map renders, pans, and zooms over the Front Range; attribution is visible. Report the style source used.
```

## Stage 1 Report

_Pending._

---

# Stage 2 — Load the graph artifact at runtime + GraphLoadError

```
Get V2's graph into the running app, per the recorded load strategy.

1. Read `NOW.md` for V2's client-vs-serverless recommendation. Implement `src/app/graphLoader.ts` that loads `public/graph/frontrange.graph.json` (client-side) or fetches it from a thin serverless endpoint, matching V2's serialization format exactly, and reconstructs the `Graph` (and snapping index) used by V3.
2. Surface load state in the UI: a loading indicator while fetching; on failure, the `GraphLoadError` state with a retry affordance (this is one of the five taxonomy states).
3. Cache the loaded graph in memory for the session.

Verify: on a clean load the graph is available (log node/edge counts matching V2). Force a failure (bad path) and confirm the GraphLoadError message + retry appear, not a blank map or a silent console error. Report both paths.
```

## Stage 2 Report

_Pending._

---

# Stage 3 — Geocode, snap, and the off-network / miss states

```
Turn human input into graph nodes, honestly.

1. Add a geocoding step in `src/app/geocode.ts`: text → coordinates. Use a geocoding service (e.g. Nominatim for dev, with debounce, attribution, and respect for its usage policy; keep it swappable behind an interface). A no-match returns the `GeocodeMiss` state.
2. Snap coordinates to the nearest routable node using V2's spatial index (`src/app/snap.ts`). If nothing is within the snap radius, return `OriginOffNetwork` or `DestinationOffNetwork` as appropriate.
3. Wire two inputs (start, end) in the control panel that resolve to snapped node ids, showing the correct one of GeocodeMiss / OffNetwork on failure.

Verify: a real Front Range address resolves and snaps to a node; a nonsense query shows GeocodeMiss; a coordinate in the middle of a reservoir shows OffNetwork (NOT a routing failure). Report all three.
```

## Stage 3 Report

_Pending._

---

# Stage 4 — Pins + query lifecycle

```
Make placing and moving points feel solid.

1. Let the user set origin and destination by clicking the map (and dragging existing pins), in addition to the text inputs. Render draggable markers.
2. Implement the query lifecycle in `src/app/queryController.ts`: any change to origin/dest triggers a re-route; a new request cancels any in-flight one (latest wins) so rapid clicks never race or render a stale result.
3. Handle `origin == dest` (same snapped node) as a trivial zero-length result with a clear message — do not run a full search or draw anything misleading.

Verify: rapidly re-clicking does not produce a stale/flashing route; dragging a pin re-routes cleanly; identical origin/dest is handled. Report the race behavior observed.
```

## Stage 4 Report

_Pending._

---

# Stage 5 — Wire the router + render the constrained route

```
Draw the actual bearing-legal route.

1. Connect the snapped (start, end) node ids to V3's `findConstrainedRoute`. Take the `Success` path (ignore the captured `exploration` for now — V5 uses it) and render it as a GeoJSON line layer on the map with a distinct primary color.
2. On a `NoBearingLegalPath` or `Disconnected` result, show the correct taxonomy message (minimal styling now; designed in V6) instead of a route. Do not draw a fake line.
3. Keep the render path a pure function of the router result so V5 can extend it without rework.

Verify: a reachable pair draws a visibly bearing-constrained route (compare by eye to a normal route — it should sometimes look odd). A trap pair shows NoBearingLegalPath, not a drawn line. Report one of each.
```

## Stage 5 Report

_Pending._

---

# Stage 6 — Ghost the shortest path + beeline + detour readout

```
Make the strangeness legible — the core comparison.

1. Also render, as secondary layers: the true unconstrained shortest path (faded/ghosted) and the straight-line beeline between start and end (dashed). These are the visual baseline the constrained route deviates from.
2. Add the detour-factor readout to the control panel (constrained ÷ shortest, from V3's Success). Also show the two distances. Keep the type quiet and legible (monospace figures are fine).
3. Ensure the three layers are visually distinguishable and legible on the chosen basemap.

Verify: for a route where the rule binds, the constrained line clearly diverges from the ghosted shortest path and the detour factor reads > 1. For a grid route where it does not bind, they nearly coincide and the factor reads ~1. Report both.
```

## Stage 6 Report

_Pending._

---

# Stage 7 — Permalink (encode / decode / clamp / reproduce)

```
Make every route a shareable link — nearly free because V3 is deterministic.

1. Encode `(start, end)` coordinates in the URL (hash or query) in `src/app/permalink.ts`; update the URL whenever a route is computed.
2. On load, parse the URL, CLAMP/validate coordinates to the Front Range bbox, and reject out-of-range garbage gracefully (fall back to the default view, do not feed undefined coords into snap/search). To keep DRY, import the bbox as a shared constant used by both the offline build and the app — if it currently lives only in `build/config.ts`, lift it to a shared module both import.
3. Loading a permalink must reproduce the identical route (same path, same detour factor) because the router is deterministic.

Verify: copy a route's link, open it in a fresh tab, and confirm an identical route + detour factor. Feed an out-of-bbox/garbage link and confirm graceful fallback, not a crash. Report both.
```

## Stage 7 Report

_Pending._

---

# Stage 8 — Coherence + Verify + update NOW.md

```
Prove the app is whole and record it.

1. Run `npm run typecheck`, `npm test`, `npm run build` — all green. Do a literal walkthrough: enter two addresses, get a constrained route + ghosts + detour number, share the link, reopen it, confirm reproduction. Exercise each of the five failure states once (GraphLoadError, GeocodeMiss, Origin/DestinationOffNetwork, NoBearingLegalPath, Disconnected) and confirm each shows its own correct message.
2. Confirm no duplicated geo/rule math crept into the app layer (the DRY invariant): the app imports V1's geo core and V3's router, and never recomputes bearings or legality.
3. Update `NOW.md`: move "Map UI" to functional with the V4 tag and a one-line note that the app statically renders constrained routes + ghosts + detour + permalinks, so V5 can layer the Reveal on the captured exploration.

Verify: full green; all five states demonstrated; NOW.md updated. Report a one-paragraph summary of what V4 now delivers.
```

## Stage 8 Report

_Pending._

---

# After These Stages
- Loose Bearing is a usable (if plain) app: real addresses in, a bearing-constrained route drawn against the ghosted shortest path and beeline, a detour-factor readout, honest per-state failures, and shareable deterministic permalinks.
- Explicitly still deferred (see `NOW.md`): the animated Reveal over the captured exploration (V5), and the greatest-hits gallery + designed failure-state screens + accessibility/mobile polish + ship (V6).
- Next major build: **V5 — The Reveal**, the one over-invested hero slice, animating the captured exploration (route trace, the 90° cone, rejected-turn flashes, arrival stats, and the dead-end bloom). Consider running `/plan-design-review` before starting it.
