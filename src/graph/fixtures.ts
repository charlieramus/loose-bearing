// Hand-built fixture graphs — the ground truth for every router test in V3. Bearings and
// lengths are computed from the node coordinates via src/geo/geo.ts, so each fixture is
// internally consistent (no hand-typed magic angles). Coordinates sit in the Front Range
// (near Boulder, CO) but the exact placement only matters relatively.

import { haversineMeters, initialBearingDeg, type LatLng } from "../geo/geo";
import type { DirectedEdge, Graph, Node } from "./types";

/** Build a Graph from nodes and a list of directed (from,to) id pairs. */
function buildGraph(nodes: Node[], directed: Array<[number, number]>): Graph {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const adjacency = new Map<number, DirectedEdge[]>();
  for (const n of nodes) adjacency.set(n.id, []);

  for (const [from, to] of directed) {
    const a = byId.get(from);
    const b = byId.get(to);
    if (!a || !b) throw new Error(`edge references unknown node: ${from}->${to}`);
    const p: LatLng = { lat: a.lat, lng: a.lng };
    const q: LatLng = { lat: b.lat, lng: b.lng };
    adjacency.get(from)!.push({
      from,
      to,
      bearingDeg: initialBearingDeg(p, q),
      lengthMeters: haversineMeters(p, q),
    });
  }
  return { nodes, adjacency };
}

/** Turn each undirected segment into a pair of directed edges. */
function bidirectional(pairs: Array<[number, number]>): Array<[number, number]> {
  return pairs.flatMap(([a, b]) => [
    [a, b],
    [b, a],
  ] as Array<[number, number]>);
}

// ─────────────────────────────────────────────────────────────────────────────
// gridGraph — a 4×4 rectangular street grid. Node id = row*4 + col. Every segment is
// two-way. On a grid most destinations are reachable under the bearing rule; this is the
// "normal-ish route" fixture.
// ─────────────────────────────────────────────────────────────────────────────

const GRID_N = 4;
const GRID_ORIGIN = { lat: 40.0, lng: -105.27 };
const GRID_STEP = 0.002; // ~200 m between adjacent intersections

const gridNodes: Node[] = [];
for (let r = 0; r < GRID_N; r++) {
  for (let c = 0; c < GRID_N; c++) {
    gridNodes.push({
      id: r * GRID_N + c,
      lat: GRID_ORIGIN.lat + r * GRID_STEP, // north as row increases
      lng: GRID_ORIGIN.lng + c * GRID_STEP, // east as col increases
    });
  }
}

const gridSegments: Array<[number, number]> = [];
for (let r = 0; r < GRID_N; r++) {
  for (let c = 0; c < GRID_N; c++) {
    const id = r * GRID_N + c;
    if (c + 1 < GRID_N) gridSegments.push([id, id + 1]); // east neighbor
    if (r + 1 < GRID_N) gridSegments.push([id, id + GRID_N]); // north neighbor
  }
}

export const gridGraph: Graph = buildGraph(gridNodes, bidirectional(gridSegments));

// ─────────────────────────────────────────────────────────────────────────────
// trapGraph — from the interior START node, EVERY out-edge points more than 90° away from
// the DEST node, so DEST is bearing-unreachable even though the graph is connected (a path
// START→A→DEST exists). This is the fixture that must yield NoBearingLegalPath in V3.
//
//        DEST (0)  ← north
//          ▲
//   A (2)  |  B (3)
//     \    |    /
//      \   |   /
//       START (1)
//
// START sits south of DEST (bearing to DEST ≈ 0°/north), but its only exits go to A (SW)
// and B (SE) — both > 90° off north — so the router cannot take a first legal step.
// ─────────────────────────────────────────────────────────────────────────────

export const TRAP_DEST_NODE = 0;
export const TRAP_START_NODE = 1;

const trapNodes: Node[] = [
  { id: 0, lat: 40.01, lng: -105.0 }, // DEST — due north of START
  { id: 1, lat: 40.0, lng: -105.0 }, // START — interior node
  { id: 2, lat: 39.995, lng: -105.005 }, // A — south-west of START
  { id: 3, lat: 39.995, lng: -104.995 }, // B — south-east of START
];

// START's only out-edges go SW and SE (both illegal toward the northern DEST); A and B
// each connect on to DEST so the graph stays connected.
const trapDirected: Array<[number, number]> = [
  [1, 2], // START → A  (bearing ≈ 225°)
  [1, 3], // START → B  (bearing ≈ 135°)
  [2, 0], // A → DEST
  [3, 0], // B → DEST
];

export const trapGraph: Graph = buildGraph(trapNodes, trapDirected);

// ─────────────────────────────────────────────────────────────────────────────
// disconnectedGraph — two components with no edges between them. A destination in the
// second component is unreachable regardless of the bearing rule (feeds the Disconnected
// state in V3).
// ─────────────────────────────────────────────────────────────────────────────

const disconnectedNodes: Node[] = [
  { id: 0, lat: 40.0, lng: -105.27 },
  { id: 1, lat: 40.002, lng: -105.27 },
  { id: 2, lat: 40.1, lng: -105.1 }, // far away — second component
  { id: 3, lat: 40.102, lng: -105.1 },
];

export const disconnectedGraph: Graph = buildGraph(
  disconnectedNodes,
  bidirectional([
    [0, 1], // component one
    [2, 3], // component two — no link to component one
  ]),
);

// ─────────────────────────────────────────────────────────────────────────────
// detourGraph — the bearing rule BINDS here, forcing a longer legal route. The cheap
// unconstrained path S→W→D takes a westward first hop (away from the eastern DEST — illegal
// under the 90° rule), so the constrained router must instead take the longer legal detour
// S→N→D. This is the fixture with a KNOWN detour factor (Stage 5): the ratio of the N-route
// length to the W-route length (~1.43 with these coordinates).
//
//            N (3)   ← north-east of S, legal first step
//           /   \
//   W (2)--S(0)  \--→ D (1)   ← DEST due east of S
//    (west, illegal first step)
// ─────────────────────────────────────────────────────────────────────────────

export const DETOUR_START = 0;
export const DETOUR_DEST = 1;

const detourNodes: Node[] = [
  { id: 0, lat: 40.0, lng: -105.0 }, // S — start
  { id: 1, lat: 40.0, lng: -104.9 }, // D — destination, due east of S
  { id: 2, lat: 40.0, lng: -105.01 }, // W — west of S; cheap unconstrained hop but illegal
  { id: 3, lat: 40.05, lng: -104.98 }, // N — north-east of S; legal but longer detour
];

// Directed: the short route S→W→D and the legal detour S→N→D. S→W is illegal toward the
// eastern DEST, so the constrained search is pushed onto S→N→D.
const detourDirected: Array<[number, number]> = [
  [0, 2], // S → W  (bearing ≈ 270°, illegal toward east)
  [2, 1], // W → D
  [0, 3], // S → N  (bearing ≈ 17°, legal)
  [3, 1], // N → D
];

export const detourGraph: Graph = buildGraph(detourNodes, detourDirected);
