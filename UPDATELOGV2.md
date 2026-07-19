charlie

# Loose Bearing — OSM graph pipeline, offline build (build 2/6)
# Work on one stage at a time. Do NOT combine stages.

---

## Context
Read `NOW.md` first. V1 shipped a tested geo core (`src/geo/geo.ts`, `src/geo/bearingRule.ts`) and graph types (`src/graph/types.ts`). This log fills the empty `build/` directory: it turns a raw OpenStreetMap Front Range extract into a compact, loadable, validated directed graph that the runtime (V4) loads and the router (V3) searches.

Log 2 of the Loose Bearing build set (V1 → **V2** → V3 → V4 → V5 → V6). V3 consumes this graph; it does not care how it was built as long as edges carry precomputed bearings and lengths.

**The graph artifact = a directed street graph for the Front Range, where every edge already knows its bearing and length, plus a nearest-node spatial index for snapping.** Building it is a one-time offline step (scripts in `build/`), not part of the shipped web app.

This log builds only the **offline pipeline and the artifact it emits**. It does **not** implement any search (V3) or load the artifact into a running app (V4) — those are separate logs. Everything here runs under `node`/`tsx` from the command line.

## Decisions (agreed in the CEO review)
- **Custom graph, no routing engine.** We build our own directed graph; we do NOT wrap OSRM/GraphHopper/Valhalla. (Locked in the CEO plan.)
- **Region:** Front Range Colorado, via a clipped bbox of the Geofabrik Colorado extract. Document the exact bbox.
- **Ways kept:** drivable/walkable `highway=*` classes only; drop everything else at filter time to keep the artifact small.
- **Bearings precomputed at build time** using V1's `initialBearingDeg` — the runtime never recomputes edge bearings. Edges are the chord bearing from the edge's from-node to its to-node.
- **Directed graph:** two directed edges per two-way street; a single directed edge for `oneway=yes` (respect `oneway=-1`).
- **Artifact size is a decision gate:** Stage 5 measures the serialized size. Tens of MB → V4 loads it client-side (zero backend). Much larger → V4 uses a thin serverless fetch. Record the number in the stage report; do not decide the app architecture before measuring.
- **Reproducible:** the whole pipeline is scripted and re-runnable (`build/` scripts numbered in order). Swapping the extract for another region should be a bbox + rerun, nothing hand-edited.
- **Design system:** none (no UI in this log).
- Large-ish system: **six stages.**

---

# Stage 1 — Acquire and clip the extract

```
Get the raw OSM data deterministically.

1. Create `build/01-download.ts` (run with tsx/node): download the Geofabrik Colorado `.osm.pbf` to `build/data/colorado-latest.osm.pbf` (skip if already present; print size + a checksum).
2. Define the Front Range bbox as a named constant in `build/config.ts` (e.g. roughly Fort Collins → Pueblo, plains east of I-25 out to the foothills/mountain seam west — pick concrete min/max lat/lng and document why). This same bbox constant is reused later for permalink coordinate clamping in V4, so export it cleanly.
3. Clip the extract to the bbox → `build/data/frontrange.osm.pbf`. Prefer `osmium extract` if osmium is available (document the exact command); otherwise do the bbox clip in the parse step of Stage 2. State which path you took.
4. Write `build/data/PROVENANCE.md`: source URL, download date, extract bbox, and license attribution (ODbL) that must appear in the app footer later.

Verify: `frontrange.osm.pbf` exists and is smaller than the state extract; PROVENANCE.md is complete. Report both file sizes and the chosen bbox.
```

## Stage 1 Report

_Pending._

---

# Stage 2 — Parse and filter ways

```
Read the clipped extract and keep only routable streets.

1. Add an OSM PBF reader dependency (e.g. `osm-pbf-parser` for streaming JS parsing) and create `build/02-parse-filter.ts`.
2. Stream the PBF. Keep ways whose `highway` tag is in an allowlist of drivable/walkable classes (motorway, trunk, primary, secondary, tertiary, residential, unclassified, service, living_street, plus foot/path if you want walkable — pick and document the set). Drop all other ways.
3. For each kept way, retain: its ordered list of node refs, the `highway` class, `oneway` (normalize yes/true/1 → forward, -1 → reverse, else two-way), and the way id.
4. Collect the set of node ids referenced by kept ways, then do a second pass (or use the parser's node stream) to capture lat/lng for exactly those nodes. Write an intermediate `build/data/filtered.json` (or a compact intermediate) holding kept ways + the needed node coordinates.

Verify: print counts — raw ways, kept ways, referenced nodes. Spot-check that a known named road in the region survived (log its way id/name). `filtered.json` round-trips. Report the counts and the spot-check.
```

## Stage 2 Report

_Pending._

---

# Stage 3 — Build the directed graph (split at intersections)

```
Turn filtered ways into a routable directed graph.

1. Create `build/03-build-graph.ts`. Determine intersection nodes: any node shared by two or more kept ways, plus the first and last node of every way. These become graph `Node`s.
2. Walk each way's node sequence; every run between consecutive intersection nodes becomes one graph edge. The edge's geometry length is the summed haversine length of its intermediate segments (use V1's `haversineMeters`).
3. Emit directed edges honoring `oneway`: two-way ways yield edges in both directions; oneway yields one direction (respect reverse for `-1`).
4. Assign stable graph node ids (deterministic — e.g. sort source OSM node ids and index them, so a rerun on the same input yields identical ids; determinism matters because V4 permalinks encode positions that snap to these nodes).
5. Produce an in-memory `Graph` matching `src/graph/types.ts`. Do not yet serialize (Stage 5).

Verify: a known one-way street produces a single-direction edge; a known two-way produces both directions. Report graph node count, directed-edge count, and the average out-degree. Confirm ids are stable across two runs.
```

## Stage 3 Report

_Pending._

---

# Stage 4 — Precompute edge bearings and lengths

```
Attach the numbers the runtime must never recompute.

1. Extend the graph build so every `DirectedEdge` carries `bearingDeg` (from-node → to-node chord bearing via V1's `initialBearingDeg`) and `lengthMeters` (from Stage 3). Reuse the geo core; do not write new bearing math here (DRY invariant from V1).
2. Sanity-clamp/normalize bearings to [0, 360). Ensure a two-way street's opposite edges have bearings ~180° apart.

Verify: pick 3–5 edges whose real-world orientation you can eyeball on a map and confirm the stored bearing matches (e.g. an east–west residential street reads ~90°/~270°). Assert the opposite-edge ~180° property across a sample. Report the checked edges.
```

## Stage 4 Report

_Pending._

---

# Stage 5 — Serialize the artifact + spatial index (the size gate)

```
Emit the loadable artifact and answer the client-vs-serverless question with a real number.

1. Create `build/05-export.ts`. Serialize the graph to `public/graph/frontrange.graph.json` (or a compact binary/typed-array format if JSON is bloated — your call, but document it and make the loader in V4 match). Keep the schema minimal: nodes array, edges array (indexes into nodes, not repeated coords), bearings, lengths.
2. Build a nearest-node spatial index for snapping (a uniform grid keyed by rounded lat/lng, or `kdbush`) and serialize it alongside — OR make it cheap to rebuild at load time and document that choice. Snapping must find the nearest routable node to an arbitrary click within a small radius.
3. Measure and RECORD the serialized artifact size (gzipped and raw). This is the architecture gate: note in the report whether it comfortably fits a client-side load (target: tens of MB gzipped or less) or whether V4 should fetch it from a serverless function.

Verify: the artifact loads back into an identical `Graph` (round-trip test). A snapping query for a known coordinate returns the expected nearest node. Report raw + gzipped size and your client-vs-serverless recommendation for V4.
```

## Stage 5 Report

_Pending._

---

# Stage 6 — Validation report + coherence + update NOW.md

```
Prove the graph is sane and record the pipeline as done.

1. Create `build/06-validate.ts`: print node/edge counts, connected-component count and largest-component share, out-degree distribution, count of nodes with zero out-edges (dead sinks), and a bearing histogram sanity line. Flag anything suspicious (e.g. a huge number of components suggests a broken split).
2. Run the whole pipeline end to end from the numbered scripts on a clean `build/data` to confirm reproducibility (same artifact bytes, or same counts, on a rerun).
3. Add a short `build/README.md` documenting the run order (01→06), the bbox, and how to re-target another region.
4. Update `NOW.md`: move "OSM pipeline" to functional with the V2 tag and a one-line note including the artifact size and the client-vs-serverless recommendation, so V4 reads it and does not re-measure.

Verify: `build/06-validate.ts` runs and its numbers are plausible (one dominant connected component, sane degrees). `npm run typecheck` stays clean. Report the validation numbers and confirm NOW.md is updated.
```

## Stage 6 Report

_Pending._

---

# After These Stages
- There is a real, validated, loadable Front Range street graph at `public/graph/`, with precomputed bearings + lengths and a snapping index — and a recorded size that decides V4's load strategy.
- Explicitly still deferred (see `NOW.md`): the search itself (V3) and loading/using the graph in a running app (V4+).
- Next major build: **V3 — the constrained router core**, which runs A* over this graph, enforces the V1 bearing rule, captures the explored set, and returns the five-state typed result.
