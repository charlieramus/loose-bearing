// Stage 6 — Validation report + reproducibility check.
//
// Loads the serialized artifact and prints sanity numbers: node/edge counts, out-degree
// distribution, dead sinks (nodes with no out-edges), weakly-connected components (count +
// largest-component share), and a compass bearing histogram. Then rebuilds the graph from the
// Stage 2 intermediate and confirms the artifact is reproducible byte-for-byte (modulo the
// generatedAt timestamp). Flags anything suspicious.
//
// Run: npx tsx --max-old-space-size=8192 build/06-validate.ts

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { FRONT_RANGE_BBOX } from "./config";
import { attachBearings, buildGraph, edgeCount, loadFiltered } from "./graph";
import { deserializeGraph, serializeGraph, type GraphArtifact } from "./serialize";
import { outEdges, type Graph } from "../src/graph/types";

const OUT_FILE = "public/graph/frontrange.graph.json";
const ATTRIBUTION = "© OpenStreetMap contributors (ODbL)";

/** Weakly-connected components via union-find (edges treated as undirected). */
function weaklyConnected(graph: Graph): { count: number; largest: number } {
  const N = graph.nodes.length;
  const parent = new Int32Array(N);
  const rank = new Uint8Array(N);
  for (let i = 0; i < N; i++) parent[i] = i;
  const find = (x: number): number => {
    let r = x;
    while (parent[r] !== r) r = parent[r];
    while (parent[x] !== r) {
      const next = parent[x];
      parent[x] = r;
      x = next;
    }
    return r;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    if (rank[ra] < rank[rb]) parent[ra] = rb;
    else if (rank[ra] > rank[rb]) parent[rb] = ra;
    else {
      parent[rb] = ra;
      rank[ra]++;
    }
  };
  for (const list of graph.adjacency.values()) for (const e of list) union(e.from, e.to);

  const sizes = new Map<number, number>();
  for (let i = 0; i < N; i++) {
    const r = find(i);
    sizes.set(r, (sizes.get(r) ?? 0) + 1);
  }
  let largest = 0;
  for (const s of sizes.values()) largest = Math.max(largest, s);
  return { count: sizes.size, largest };
}

function main(): void {
  const artifact = JSON.parse(readFileSync(OUT_FILE, "utf8")) as GraphArtifact;
  const graph = deserializeGraph(artifact);
  const N = graph.nodes.length;
  const E = edgeCount(graph);
  console.log(`Nodes: ${N}`);
  console.log(`Directed edges: ${E}`);
  console.log(`Average out-degree: ${(E / N).toFixed(3)}`);

  // Out-degree distribution + dead sinks.
  const degHist = new Map<number, number>();
  let deadSinks = 0;
  for (const n of graph.nodes) {
    const d = outEdges(graph, n.id).length;
    if (d === 0) deadSinks++;
    const bucket = d >= 6 ? 6 : d;
    degHist.set(bucket, (degHist.get(bucket) ?? 0) + 1);
  }
  console.log("Out-degree distribution:");
  for (let d = 0; d <= 6; d++) {
    const c = degHist.get(d) ?? 0;
    console.log(`  ${d === 6 ? "6+" : d}: ${c} (${((c / N) * 100).toFixed(1)}%)`);
  }
  console.log(`Dead sinks (out-degree 0): ${deadSinks} (${((deadSinks / N) * 100).toFixed(2)}%)`);

  // Weakly-connected components.
  const wcc = weaklyConnected(graph);
  const largestShare = (wcc.largest / N) * 100;
  console.log(
    `Weakly-connected components: ${wcc.count}; largest holds ${wcc.largest} nodes ` +
      `(${largestShare.toFixed(2)}%)`,
  );

  // Bearing histogram (8 compass sectors, N sector centered on 0°).
  const sectors = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const bins = new Array(8).fill(0);
  for (const list of graph.adjacency.values()) {
    for (const e of list) {
      const idx = Math.round(e.bearingDeg / 45) % 8;
      bins[idx]++;
    }
  }
  console.log("Bearing histogram (compass sector → edge count):");
  for (let i = 0; i < 8; i++) console.log(`  ${sectors[i].padEnd(2)}: ${bins[i]}`);

  // Flags.
  const flags: string[] = [];
  if (largestShare < 90) flags.push(`largest component only ${largestShare.toFixed(1)}% (< 90%)`);
  if (deadSinks / N > 0.05) flags.push(`>5% dead sinks`);
  const emptyBins = bins.filter((b) => b === 0).length;
  if (emptyBins > 0) flags.push(`${emptyBins} empty bearing sector(s)`);
  if (flags.length) console.log("⚠ FLAGS: " + flags.join("; "));
  else console.log("No anomalies flagged (one dominant component, sane degrees, all sectors populated).");

  // Reproducibility: rebuild from the intermediate, re-serialize, compare (ignoring timestamp).
  const rebuilt = buildGraph(loadFiltered());
  attachBearings(rebuilt);
  const reArtifact = JSON.stringify(serializeGraph(rebuilt, FRONT_RANGE_BBOX, ATTRIBUTION));
  const strip = (s: string): string => s.replace(/"generatedAt":"[^"]*"/, '"generatedAt":""');
  const onDisk = strip(readFileSync(OUT_FILE, "utf8"));
  const rebuiltHash = createHash("sha256").update(strip(reArtifact)).digest("hex");
  const diskHash = createHash("sha256").update(onDisk).digest("hex");
  console.log(`Reproducibility: rebuilt ${rebuiltHash.slice(0, 16)} vs on-disk ${diskHash.slice(0, 16)}`);
  if (rebuiltHash !== diskHash) throw new Error("artifact is NOT reproducible from the intermediate");
  console.log("Reproducibility: artifact rebuilds byte-identically (excluding timestamp) ✓");
}

main();
