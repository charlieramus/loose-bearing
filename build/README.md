# build/ — offline OSM → graph pipeline (V2)

Turns a raw OpenStreetMap Front Range extract into the compact, validated, directed street
graph the app loads (`public/graph/frontrange.graph.json`). This is a one-time **offline** step
— none of it ships in the web app. Everything runs under `node`/`tsx` from the command line.

## Run order

Run the numbered scripts in order. The heavy passes need a larger heap, so pass
`--max-old-space-size=8192`:

```bash
npx tsx build/01-download.ts                              # fetch + checksum the Colorado extract
npx tsx --max-old-space-size=8192 build/02-parse-filter.ts  # clip to bbox + keep routable ways
npx tsx --max-old-space-size=8192 build/03-build-graph.ts   # split at intersections → directed graph
npx tsx --max-old-space-size=8192 build/04-bearings.ts      # attach precomputed bearings (verify)
npx tsx --max-old-space-size=8192 build/05-export.ts        # serialize artifact + size gate
npx tsx --max-old-space-size=8192 build/06-validate.ts      # validation report + reproducibility
```

`03` and `04` are verification/build-up stages that rebuild in memory; the artifact that the
app consumes is written by `05` and validated by `06`.

## What each stage produces

| Stage | Script | Output |
| ----- | ------ | ------ |
| 1 | `01-download.ts` | `build/data/colorado-latest.osm.pbf` (+ SHA-256), `PROVENANCE.md` |
| 2 | `02-parse-filter.ts` | `build/data/filtered.json` — routable ways + in-bbox node coords |
| 3 | `03-build-graph.ts` | in-memory directed graph (topology + lengths); prints stats |
| 4 | `04-bearings.ts` | in-memory graph with edge bearings; prints eyeball/opposite checks |
| 5 | `05-export.ts` | `public/graph/frontrange.graph.json` (CSR); prints raw + gzip size |
| 6 | `06-validate.ts` | validation report + reproducibility hash |

Shared modules: `config.ts` (bbox + allowlist), `graph.ts` (builder), `serialize.ts` (artifact
schema + loader — **V4 imports this**), `spatial.ts` (snapping grid, rebuilt at load).

## Region / bbox

The clip window is `FRONT_RANGE_BBOX` in [`config.ts`](./config.ts):
`lat [38.20, 40.65] × lng [-105.35, -104.60]` — the Fort Collins → Pueblo corridor from the
foothills seam west to just east of I-25. Rationale is documented inline in `config.ts` and
[`data/PROVENANCE.md`](./data/PROVENANCE.md).

## Re-targeting another region

1. Edit `FRONT_RANGE_BBOX` in `config.ts` (and, if it's another state, `COLORADO_EXTRACT_URL`).
2. Delete `build/data/` and rerun `01`→`06`.

Nothing downstream is hand-edited — a bbox change plus a rerun is the whole retarget.

## Artifact & load strategy (measured in Stage 5)

`public/graph/frontrange.graph.json`: 1,426,625 nodes / 3,631,737 edges, **99.9 MB raw /
31.1 MB gzipped**. That's "tens of MB" → **V4 loads it client-side, zero backend** (it may later
shrink via typed-array binary or tiling if the one-time fetch feels heavy).

## Determinism

The transform (02→05) is deterministic: identical input `.pbf` → identical artifact bytes,
verified by Stage 6's reproducibility check (`06-validate.ts` rebuilds the artifact from the
intermediate and compares hashes). The only per-run byte differences are the `generatedAt`
timestamps embedded in `filtered.json` and the artifact; all content is identical. The source
extract is pinned by the SHA-256 recorded in `data/PROVENANCE.md`.

`build/data/` (the raw extract + heavy intermediates) is gitignored; so is `public/graph/` (the
generated artifact). Regenerate them with the run above.

## License

OSM data © OpenStreetMap contributors, ODbL 1.0. The app footer (V4+) must carry
"© OpenStreetMap contributors".
