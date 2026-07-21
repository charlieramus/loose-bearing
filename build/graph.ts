// Shared graph builder for the offline pipeline — used by Stage 3 (topology) and Stage 4
// (bearings). Turns the Stage 2 `filtered.json` (routable ways + node coords) into an
// in-memory `Graph` matching src/graph/types.ts. All distance/bearing math is reused from the
// V1 geo core; nothing here reimplements it (DRY invariant).

import { readFileSync } from "node:fs";
import { haversineMeters, initialBearingDeg, type LatLng } from "../src/geo/geo";
import type { DirectedEdge, Graph, Node } from "../src/graph/types";
import { FILTERED_JSON } from "./config";

export type OneWay = "forward" | "reverse" | "two-way";

export type Filtered = {
  source: string;
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  generatedAt: string;
  counts: Record<string, number>;
  nodes: { ids: number[]; lats: number[]; lngs: number[] };
  ways: Array<{
    id: number;
    highway: string;
    oneway: OneWay;
    name?: string;
    refs: number[];
  }>;
};

export function loadFiltered(path: string = FILTERED_JSON): Filtered {
  return JSON.parse(readFileSync(path, "utf8")) as Filtered;
}

// Stage 3 builds topology + lengths and leaves every edge's bearing at this sentinel; Stage 4
// (`attachBearings`) fills in the real chord bearings before the artifact is serialized.
export const BEARING_UNSET = 0;

/** Intersection detection + stable id assignment, factored out so Stage 3 can verify it. */
export type GraphIndex = {
  coord: Map<number, LatLng>;
  isCut: (osmId: number) => boolean;
  graphId: Map<number, number>;
  nodes: Node[];
};

export function buildIndex(f: Filtered): GraphIndex {
  // OSM id → coordinate.
  const coord = new Map<number, LatLng>();
  for (let i = 0; i < f.nodes.ids.length; i++) {
    coord.set(f.nodes.ids[i], { lat: f.nodes.lats[i], lng: f.nodes.lngs[i] });
  }

  // How many distinct ways use each node (for intersection detection).
  const usage = new Map<number, number>();
  for (const w of f.ways) {
    const seen = new Set<number>();
    for (const r of w.refs) {
      if (seen.has(r)) continue;
      seen.add(r);
      usage.set(r, (usage.get(r) ?? 0) + 1);
    }
  }
  const isCut = (osmId: number): boolean => (usage.get(osmId) ?? 0) >= 2;

  // Intersection OSM ids = every way's first & last node + any interior node shared by ≥2 ways.
  const interOsm = new Set<number>();
  for (const w of f.ways) {
    const refs = w.refs;
    interOsm.add(refs[0]);
    interOsm.add(refs[refs.length - 1]);
    for (let i = 1; i < refs.length - 1; i++) if (isCut(refs[i])) interOsm.add(refs[i]);
  }

  // Stable graph ids: sort OSM ids ascending, index them.
  const sorted = [...interOsm].sort((a, b) => a - b);
  const graphId = new Map<number, number>();
  const nodes: Node[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const osm = sorted[i];
    graphId.set(osm, i);
    const c = coord.get(osm)!;
    nodes.push({ id: i, lat: c.lat, lng: c.lng });
  }

  return { coord, isCut, graphId, nodes };
}

/**
 * The ordered graph-id spans a single way contributes (before oneway direction is applied),
 * with the way's oneway sense. Used by Stage 3 to verify oneway vs two-way edge emission.
 */
export function waySpans(
  f: Filtered,
  wayId: number,
  idx: GraphIndex,
): Array<{ from: number; to: number; oneway: OneWay }> {
  const w = f.ways.find((x) => x.id === wayId);
  if (!w) return [];
  const spans: Array<{ from: number; to: number; oneway: OneWay }> = [];
  let startOsm = w.refs[0];
  for (let i = 1; i < w.refs.length; i++) {
    const atEnd = i === w.refs.length - 1;
    if (atEnd || idx.isCut(w.refs[i])) {
      const from = idx.graphId.get(startOsm);
      const to = idx.graphId.get(w.refs[i]);
      if (from !== undefined && to !== undefined && from !== to) {
        spans.push({ from, to, oneway: w.oneway });
      }
      startOsm = w.refs[i];
    }
  }
  return spans;
}

/**
 * Build the directed graph from filtered ways.
 *
 * Vertices are OSM nodes that are either an endpoint of some way or shared by ≥2 ways
 * (true intersections). Each maximal run of a way between consecutive vertices becomes one
 * graph edge whose length is the summed haversine of its intermediate segments. Two-way ways
 * emit both directions; `forward`/`reverse` oneways emit a single direction. Parallel
 * duplicate edges between the same ordered pair are collapsed to the shortest; self-loops are
 * dropped. Graph node ids are assigned by sorting the source OSM ids ascending and indexing —
 * deterministic, so a rerun on the same input yields identical ids (V4 permalinks depend on
 * this).
 *
 * Bearings are left at BEARING_UNSET here; call `attachBearings` (Stage 4) to fill them.
 */
export function buildGraph(f: Filtered, idx: GraphIndex = buildIndex(f)): Graph {
  const { coord, isCut, graphId, nodes } = idx;

  // Collapse parallel edges to the shortest per ordered (from,to).
  const best = new Map<string, { from: number; to: number; len: number }>();
  const emit = (fromOsm: number, toOsm: number, len: number, oneway: OneWay): void => {
    const A = graphId.get(fromOsm)!;
    const B = graphId.get(toOsm)!;
    if (A === B) return; // drop self-loop
    const push = (from: number, to: number): void => {
      const k = `${from},${to}`;
      const cur = best.get(k);
      if (!cur || len < cur.len) best.set(k, { from, to, len });
    };
    if (oneway === "forward") push(A, B);
    else if (oneway === "reverse") push(B, A);
    else {
      push(A, B);
      push(B, A);
    }
  };

  // Split each way at its cut nodes, accumulating haversine length per span.
  for (const w of f.ways) {
    const refs = w.refs;
    let startOsm = refs[0];
    let acc = 0;
    for (let i = 1; i < refs.length; i++) {
      const prev = coord.get(refs[i - 1])!;
      const cur = coord.get(refs[i])!;
      acc += haversineMeters(prev, cur);
      const atEnd = i === refs.length - 1;
      if (atEnd || isCut(refs[i])) {
        emit(startOsm, refs[i], acc, w.oneway);
        startOsm = refs[i];
        acc = 0;
      }
    }
  }

  const adjacency = new Map<number, DirectedEdge[]>();
  for (const n of nodes) adjacency.set(n.id, []);
  for (const e of best.values()) {
    adjacency.get(e.from)!.push({
      from: e.from,
      to: e.to,
      bearingDeg: BEARING_UNSET,
      lengthMeters: e.len,
    });
  }

  return { nodes, adjacency };
}

/**
 * Stage 4 — attach the chord bearing to every directed edge, mutating the graph in place.
 *
 * The bearing is `initialBearingDeg(fromNode, toNode)` from the V1 geo core (no new bearing
 * math), then clamped into [0, 360). `initialBearingDeg` already normalizes to that range; the
 * explicit clamp is a belt-and-suspenders guard so a downstream change can never leak a
 * negative or ≥360 value into the serialized artifact.
 */
export function attachBearings(graph: Graph): void {
  const coord = new Map<number, LatLng>();
  for (const n of graph.nodes) coord.set(n.id, { lat: n.lat, lng: n.lng });
  for (const list of graph.adjacency.values()) {
    for (const e of list) {
      const a = coord.get(e.from)!;
      const b = coord.get(e.to)!;
      const deg = initialBearingDeg(a, b);
      e.bearingDeg = ((deg % 360) + 360) % 360;
    }
  }
}

/** Total number of directed edges in the graph. */
export function edgeCount(graph: Graph): number {
  let n = 0;
  for (const edges of graph.adjacency.values()) n += edges.length;
  return n;
}
