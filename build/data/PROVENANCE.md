# Data provenance — Front Range street graph

The graph artifact shipped by this pipeline is derived from OpenStreetMap data. This file
records exactly what was ingested so the build is reproducible and the license is honored.

## Source

- **Extract:** Geofabrik Colorado (`.osm.pbf`)
- **URL:** https://download.geofabrik.de/north-america/us/colorado-latest.osm.pbf
- **Resolved snapshot:** `colorado-260720.osm.pbf` (Geofabrik daily, 2026-07-20)
- **Downloaded:** 2026-07-21
- **Raw size:** 376,098,644 bytes (358.7 MB)
- **SHA-256:** `aa3f870e4a2b492631dabd87c90f57e2d9e9384f69187be08361dde4efebec14`

The `-latest` URL 302-redirects to the current dated file, so the resolved snapshot name and
checksum above pin the exact bytes used for this build.

## Clip window (Front Range bbox)

Defined authoritatively in [`build/config.ts`](../config.ts) as `FRONT_RANGE_BBOX`:

| edge   | value    | rationale                                              |
| ------ | -------- | ------------------------------------------------------ |
| minLat | 38.20    | just south of Pueblo (~38.25 N)                        |
| maxLat | 40.65    | just north of Fort Collins (~40.58 N)                  |
| minLng | -105.35  | foothills / mountain seam west of Boulder & Fort Collins |
| maxLng | -104.60  | plains a short way east of the I-25 corridor           |

This covers the urban corridor Fort Collins → Loveland → Longmont → Boulder → Denver →
Colorado Springs → Pueblo and excludes the Western Slope and the deep eastern plains.

## Clipping method

`osmium extract` is the preferred clip tool but is **not available** in this build
environment. Per the Stage 1 spec's documented fallback, the bbox clip is performed inside
the Stage 2 streaming parse (`build/02-parse-filter.ts`): nodes outside `FRONT_RANGE_BBOX`
are discarded as the PBF is read, and only ways fully retained by that node set survive. No
intermediate `frontrange.osm.pbf` is produced; the clipped + filtered result is
`build/data/filtered.json`.

## License / attribution (must appear in the app footer)

OpenStreetMap data is © OpenStreetMap contributors, available under the
**Open Database License (ODbL) 1.0**. https://www.openstreetmap.org/copyright

The shipped app (V4+) must display: **"© OpenStreetMap contributors"** and honor ODbL
share-alike for the derived graph.
