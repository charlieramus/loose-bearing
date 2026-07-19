// The graph data model. A Loose Bearing graph is a set of nodes (street intersections)
// plus a directed adjacency structure. Edge bearing and length are precomputed at build
// time (in V2 from OSM; in the fixtures here, at construction from src/geo/geo.ts) so the
// router never has to recompute geometry per step.

/** A street intersection / graph vertex. */
export type Node = { id: number; lat: number; lng: number };

/** A one-way traversal from `from` to `to`, with its compass bearing and length. */
export type DirectedEdge = {
  from: number;
  to: number;
  bearingDeg: number;
  lengthMeters: number;
};

/** Nodes plus out-edge adjacency keyed by from-node id. */
export type Graph = {
  nodes: Node[];
  adjacency: Map<number, DirectedEdge[]>;
};

/** Out-edges leaving `nodeId` (empty array if the node has none / is unknown). */
export function outEdges(graph: Graph, nodeId: number): DirectedEdge[] {
  return graph.adjacency.get(nodeId) ?? [];
}
