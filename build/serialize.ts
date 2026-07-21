// Artifact (de)serialization — the on-disk schema for the Front Range graph and the loader
// that reconstructs it. V4 imports the SAME `deserializeGraph` / schema so the runtime and the
// build agree byte-for-byte. Keep this the single definition of the format.
//
// Format: compressed-sparse-row (CSR) adjacency in plain JSON parallel arrays.
//   - Node coordinates are stored once, indexed by graph node id (0..N-1).
//   - Edges are grouped by from-node via an `offsets` array (length N+1): the out-edges of
//     node i occupy edgeTo/edgeBearing/edgeLength[offsets[i] .. offsets[i+1]). This drops the
//     per-edge `from` field entirely.
// Rounding: coords 6 dp (~0.11 m), bearing 1 dp, length 1 dp (meters) — well inside snapping
// and rendering tolerance, and it shrinks the JSON meaningfully.

import type { DirectedEdge, Graph, Node } from "../src/graph/types";

export const ARTIFACT_VERSION = 1;

export type GraphArtifact = {
  version: number;
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  generatedAt: string;
  attribution: string;
  nodeCount: number;
  edgeCount: number;
  lat: number[]; // indexed by node id
  lng: number[];
  offsets: number[]; // length nodeCount + 1
  edgeTo: number[]; // length edgeCount
  edgeBearing: number[];
  edgeLength: number[];
};

const round = (x: number, dp: number): number => {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
};

export function serializeGraph(
  graph: Graph,
  bbox: GraphArtifact["bbox"],
  attribution: string,
): GraphArtifact {
  const N = graph.nodes.length;
  const lat = new Array<number>(N);
  const lng = new Array<number>(N);
  for (const n of graph.nodes) {
    if (n.id < 0 || n.id >= N) throw new Error(`node id ${n.id} out of range 0..${N - 1}`);
    lat[n.id] = round(n.lat, 6);
    lng[n.id] = round(n.lng, 6);
  }

  const offsets = new Array<number>(N + 1);
  const edgeTo: number[] = [];
  const edgeBearing: number[] = [];
  const edgeLength: number[] = [];
  let cursor = 0;
  for (let i = 0; i < N; i++) {
    offsets[i] = cursor;
    const es = graph.adjacency.get(i) ?? [];
    for (const e of es) {
      edgeTo.push(e.to);
      edgeBearing.push(round(e.bearingDeg, 1));
      edgeLength.push(round(e.lengthMeters, 1));
      cursor++;
    }
  }
  offsets[N] = cursor;

  return {
    version: ARTIFACT_VERSION,
    bbox,
    generatedAt: new Date().toISOString(),
    attribution,
    nodeCount: N,
    edgeCount: cursor,
    lat,
    lng,
    offsets,
    edgeTo,
    edgeBearing,
    edgeLength,
  };
}

export function deserializeGraph(a: GraphArtifact): Graph {
  const nodes: Node[] = new Array(a.nodeCount);
  for (let i = 0; i < a.nodeCount; i++) nodes[i] = { id: i, lat: a.lat[i], lng: a.lng[i] };

  const adjacency = new Map<number, DirectedEdge[]>();
  for (let i = 0; i < a.nodeCount; i++) {
    const start = a.offsets[i];
    const end = a.offsets[i + 1];
    const list: DirectedEdge[] = [];
    for (let j = start; j < end; j++) {
      list.push({
        from: i,
        to: a.edgeTo[j],
        bearingDeg: a.edgeBearing[j],
        lengthMeters: a.edgeLength[j],
      });
    }
    adjacency.set(i, list);
  }
  return { nodes, adjacency };
}
