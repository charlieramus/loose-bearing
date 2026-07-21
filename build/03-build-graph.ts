// Stage 3 — Build the directed graph (split at intersections).
//
// Loads build/data/filtered.json, builds the in-memory directed Graph (topology, lengths,
// directedness, stable ids), and verifies: a oneway street yields a single-direction edge, a
// two-way yields both; reports node/edge counts and average out-degree; confirms node ids are
// stable across two independent builds. Bearings are NOT attached here (Stage 4).
//
// Run: npx tsx --max-old-space-size=8192 build/03-build-graph.ts

import { createHash } from "node:crypto";
import { buildGraph, buildIndex, edgeCount, loadFiltered, waySpans } from "./graph";
import { outEdges } from "../src/graph/types";
import type { Graph } from "../src/graph/types";

function hasEdge(graph: Graph, from: number, to: number): boolean {
  return outEdges(graph, from).some((e) => e.to === to);
}

/** A stable fingerprint of the graph's node ids/coords + directed edge set. */
function fingerprint(graph: Graph): string {
  const h = createHash("sha256");
  for (const n of graph.nodes) h.update(`${n.id}:${n.lat.toFixed(7)}:${n.lng.toFixed(7)};`);
  const edges: string[] = [];
  for (const list of graph.adjacency.values()) {
    for (const e of list) edges.push(`${e.from}>${e.to}`);
  }
  edges.sort();
  h.update(edges.join(","));
  return h.digest("hex");
}

function main(): void {
  const f = loadFiltered();
  const idx = buildIndex(f);
  const graph = buildGraph(f, idx);

  const nNodes = graph.nodes.length;
  const nEdges = edgeCount(graph);
  console.log(`Graph: ${nNodes} nodes, ${nEdges} directed edges`);
  console.log(`Average out-degree: ${(nEdges / nNodes).toFixed(3)}`);

  // ── Oneway vs two-way spot checks ─────────────────────────────────────────
  // Two-way: Pearl Street (Boulder), way 6172458 — both directions must exist.
  const twoWay = waySpans(f, 6172458, idx)[0];
  if (twoWay) {
    const fwd = hasEdge(graph, twoWay.from, twoWay.to);
    const rev = hasEdge(graph, twoWay.to, twoWay.from);
    console.log(
      `two-way way 6172458 span ${twoWay.from}→${twoWay.to}: forward=${fwd} reverse=${rev} ` +
        `(expect both true)`,
    );
    if (!(fwd && rev)) throw new Error("two-way street did not yield both directions");
  } else {
    console.warn("two-way sample way 6172458 produced no span");
  }

  // Oneway forward: first forward way with a usable span.
  const fwdWay = f.ways.find((w) => w.oneway === "forward" && waySpans(f, w.id, idx).length > 0);
  if (fwdWay) {
    const s = waySpans(f, fwdWay.id, idx)[0];
    const fwd = hasEdge(graph, s.from, s.to);
    const rev = hasEdge(graph, s.to, s.from);
    // reverse may still exist if another two-way street overlaps that pair; report both.
    console.log(
      `forward oneway way ${fwdWay.id} ("${fwdWay.name ?? ""}") span ${s.from}→${s.to}: ` +
        `forward=${fwd} reverse=${rev} (expect forward true)`,
    );
    if (!fwd) throw new Error("forward oneway street missing its forward edge");
  }

  // Oneway reverse: first reverse way with a usable span.
  const revWay = f.ways.find((w) => w.oneway === "reverse" && waySpans(f, w.id, idx).length > 0);
  if (revWay) {
    const s = waySpans(f, revWay.id, idx)[0];
    // For a reverse way the emitted edge is to→from.
    const emitted = hasEdge(graph, s.to, s.from);
    console.log(
      `reverse oneway way ${revWay.id} ("${revWay.name ?? ""}") span ${s.from}→${s.to}: ` +
        `edge ${s.to}→${s.from}=${emitted} (expect true)`,
    );
    if (!emitted) throw new Error("reverse oneway street missing its reversed edge");
  }

  // ── Determinism: build a second time, compare fingerprints ────────────────
  const graph2 = buildGraph(f);
  const fp1 = fingerprint(graph);
  const fp2 = fingerprint(graph2);
  console.log(`Determinism: build#1 ${fp1.slice(0, 16)} vs build#2 ${fp2.slice(0, 16)}`);
  if (fp1 !== fp2) throw new Error("graph node ids / edges are not stable across builds");
  console.log("Determinism: identical fingerprints ✓");
}

main();
