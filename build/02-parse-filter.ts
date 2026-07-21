// Stage 2 — Parse the clipped extract and keep only routable streets.
//
// Streams the Colorado PBF and emits build/data/filtered.json holding the kept ways (with
// normalized oneway + ordered node refs) and the coordinates of exactly the nodes those ways
// reference, clipped to FRONT_RANGE_BBOX.
//
// Run: npx tsx --max-old-space-size=8192 build/02-parse-filter.ts
//
// Clip strategy (the osmium fallback from Stage 1): the bbox clip is folded in here. A way is
// kept iff (a) its highway class is in the allowlist AND (b) every one of its node refs
// resolves to a coordinate inside the bbox. Boundary-crossing ways (any ref outside the box)
// are dropped, giving a clean interior clip with no dangling refs.
//
// Two passes (nodes precede ways in the PBF, but there are ~52M nodes statewide, so we do NOT
// hold every node in memory):
//   Pass 1 — read ways: keep routable ways, record their meta + refs, and union all their
//            referenced node ids into a Set.
//   Pass 2 — read nodes: for each node that is referenced AND inside the bbox, store its coord.
// Then keep only the ways whose refs are all present in the coord map.

import { createOSMStream } from "osm-pbf-parser-node";
import { writeFileSync } from "node:fs";
import {
  COLORADO_PBF,
  FILTERED_JSON,
  FRONT_RANGE_BBOX,
  KEPT_HIGHWAY_CLASSES,
  inBBox,
} from "./config";

/** The subset of the parser's item shapes we consume (its iterator is typed as `object`). */
type OSMItem = {
  type: "node" | "way" | "relation";
  id: number | string;
  lat?: number;
  lon?: number;
  refs?: Array<number | string>;
  tags?: Record<string, string>;
};

type OneWay = "forward" | "reverse" | "two-way";

// A single JS Set/Map tops out at 2^24 (~16.7M) entries, and the statewide routable-node id
// set exceeds that. Shard across buckets keyed by the id's low bits to lift the ceiling.
const SHARDS = 32;
const shardOf = (id: number): number => id & (SHARDS - 1);

class ShardedSet {
  private s = Array.from({ length: SHARDS }, () => new Set<number>());
  add(id: number): void {
    this.s[shardOf(id)].add(id);
  }
  has(id: number): boolean {
    return this.s[shardOf(id)].has(id);
  }
  get size(): number {
    return this.s.reduce((n, set) => n + set.size, 0);
  }
}

class ShardedCoords {
  private m = Array.from({ length: SHARDS }, () => new Map<number, [number, number]>());
  set(id: number, v: [number, number]): void {
    this.m[shardOf(id)].set(id, v);
  }
  get(id: number): [number, number] | undefined {
    return this.m[shardOf(id)].get(id);
  }
  has(id: number): boolean {
    return this.m[shardOf(id)].has(id);
  }
  get size(): number {
    return this.m.reduce((n, map) => n + map.size, 0);
  }
  *entries(): IterableIterator<[number, [number, number]]> {
    for (const map of this.m) yield* map.entries();
  }
}

type KeptWay = {
  id: number;
  highway: string;
  oneway: OneWay;
  name?: string;
  refs: number[];
};

/**
 * Normalize the many OSM oneway spellings into a direction relative to the way's node order.
 * `junction=roundabout` (and `circular`) is implicitly oneway forward per OSM convention, so
 * we honor it even without an explicit oneway tag — otherwise every roundabout would emit
 * illegal wrong-way edges. (Minor, documented extension to the spec's yes/-1/else rule.)
 */
function normalizeOneway(tags: Record<string, string>): OneWay {
  const ow = tags.oneway?.trim().toLowerCase();
  if (ow === "yes" || ow === "true" || ow === "1") return "forward";
  if (ow === "-1" || ow === "reverse") return "reverse";
  if (ow === "no" || ow === "false" || ow === "0") return "two-way";
  const junction = tags.junction?.trim().toLowerCase();
  if (junction === "roundabout" || junction === "circular") return "forward";
  return "two-way";
}

async function main(): Promise<void> {
  console.log(`Reading ${COLORADO_PBF}`);
  console.log(
    `Clip bbox: lat [${FRONT_RANGE_BBOX.minLat}, ${FRONT_RANGE_BBOX.maxLat}], ` +
      `lng [${FRONT_RANGE_BBOX.minLng}, ${FRONT_RANGE_BBOX.maxLng}]`,
  );

  // ── Pass 1: ways ──────────────────────────────────────────────────────────
  let rawWays = 0;
  const keptWaysRaw: KeptWay[] = [];
  const referenced = new ShardedSet();

  const t1 = Date.now();
  for await (const raw of createOSMStream(COLORADO_PBF)) {
    const item = raw as OSMItem;
    if (item.type !== "way") continue;
    rawWays++;
    const tags = (item.tags ?? {}) as Record<string, string>;
    const highway = tags.highway;
    if (!highway || !KEPT_HIGHWAY_CLASSES.has(highway)) continue;
    const refs = (item.refs ?? []) as number[];
    if (refs.length < 2) continue; // a routable way needs at least two nodes
    keptWaysRaw.push({
      id: Number(item.id),
      highway,
      oneway: normalizeOneway(tags),
      name: tags.name,
      refs: refs.map(Number),
    });
    for (const r of refs) referenced.add(Number(r));
  }
  console.log(
    `Pass 1 done in ${((Date.now() - t1) / 1000).toFixed(1)}s — raw ways ${rawWays}, ` +
      `routable ways (pre-clip) ${keptWaysRaw.length}, referenced node ids ${referenced.size}`,
  );

  // ── Pass 2: nodes (only referenced + in-bbox) ─────────────────────────────
  const coords = new ShardedCoords(); // id → [lat, lng], only referenced + in-bbox
  let rawNodes = 0;
  const t2 = Date.now();
  for await (const raw of createOSMStream(COLORADO_PBF)) {
    const item = raw as OSMItem;
    if (item.type !== "node") continue;
    rawNodes++;
    const id = Number(item.id);
    if (!referenced.has(id)) continue;
    const lat = item.lat as number;
    const lng = item.lon as number;
    if (!inBBox(lat, lng)) continue;
    coords.set(id, [lat, lng]);
  }
  console.log(
    `Pass 2 done in ${((Date.now() - t2) / 1000).toFixed(1)}s — raw nodes ${rawNodes}, ` +
      `referenced nodes in bbox ${coords.size}`,
  );

  // ── Clip: keep ways whose every ref is inside the bbox ────────────────────
  const keptWays = keptWaysRaw.filter((w) => w.refs.every((r) => coords.has(r)));
  const usedNodes = new ShardedSet();
  for (const w of keptWays) for (const r of w.refs) usedNodes.add(r);

  console.log(
    `Clip: ways fully inside bbox ${keptWays.length} / ${keptWaysRaw.length}; ` +
      `nodes used ${usedNodes.size}`,
  );

  // Spot-check: a known Front Range named road should survive.
  const spot =
    keptWays.find((w) => w.name === "Pearl Street") ??
    keptWays.find((w) => /Pearl Street/i.test(w.name ?? "")) ??
    keptWays.find((w) => (w.name ?? "").length > 0);
  if (spot) {
    console.log(
      `Spot-check named road: "${spot.name}" way ${spot.id} (${spot.highway}, ` +
        `${spot.oneway}, ${spot.refs.length} refs)`,
    );
  } else {
    console.warn("Spot-check: no named road found among kept ways (!)");
  }

  // ── Serialize the intermediate ────────────────────────────────────────────
  // Compact: nodes as parallel arrays keyed by index; ways reference node ids directly.
  const nodeIds: number[] = [];
  const nodeLats: number[] = [];
  const nodeLngs: number[] = [];
  for (const [id, [lat, lng]] of coords.entries()) {
    if (!usedNodes.has(id)) continue;
    nodeIds.push(id);
    nodeLats.push(lat);
    nodeLngs.push(lng);
  }

  const out = {
    source: COLORADO_PBF,
    bbox: FRONT_RANGE_BBOX,
    generatedAt: new Date().toISOString(),
    counts: {
      rawWays,
      routableWaysPreClip: keptWaysRaw.length,
      keptWays: keptWays.length,
      nodes: nodeIds.length,
    },
    nodes: { ids: nodeIds, lats: nodeLats, lngs: nodeLngs },
    ways: keptWays,
  };
  writeFileSync(FILTERED_JSON, JSON.stringify(out));
  console.log(`Wrote ${FILTERED_JSON} — ${keptWays.length} ways, ${nodeIds.length} nodes`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
