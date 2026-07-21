// Stage 5 — Serialize the artifact + spatial index, and answer the size gate.
//
// Emits public/graph/frontrange.graph.json (CSR schema, see build/serialize.ts), measures its
// raw + gzipped size, and verifies a lossless round-trip plus a snapping query. The spatial
// index is intentionally NOT serialized — it is rebuilt at load from the node array (see
// build/spatial.ts) — which keeps the artifact minimal.
//
// Run: npx tsx --max-old-space-size=8192 build/05-export.ts

import { gzipSync } from "node:zlib";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { FRONT_RANGE_BBOX } from "./config";
import { attachBearings, buildGraph, edgeCount, loadFiltered } from "./graph";
import { buildGrid, nearest } from "./spatial";
import { deserializeGraph, serializeGraph, type GraphArtifact } from "./serialize";

const OUT_DIR = "public/graph";
const OUT_FILE = `${OUT_DIR}/frontrange.graph.json`;
const ATTRIBUTION = "© OpenStreetMap contributors (ODbL)";

function humanBytes(n: number): string {
  return `${(n / 1024 / 1024).toFixed(1)} MB (${n} bytes)`;
}

function main(): void {
  const f = loadFiltered();
  const graph = buildGraph(f);
  attachBearings(graph);
  console.log(`Graph: ${graph.nodes.length} nodes, ${edgeCount(graph)} edges`);

  // ── Serialize ─────────────────────────────────────────────────────────────
  const artifact = serializeGraph(graph, FRONT_RANGE_BBOX, ATTRIBUTION);
  const json = JSON.stringify(artifact);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, json);
  console.log(`Wrote ${OUT_FILE}`);

  // ── Size gate ──────────────────────────────────────────────────────────────
  const rawBytes = statSync(OUT_FILE).size;
  const gzBytes = gzipSync(Buffer.from(json), { level: 9 }).length;
  console.log(`Artifact size — raw: ${humanBytes(rawBytes)}`);
  console.log(`Artifact size — gzipped(9): ${humanBytes(gzBytes)}`);

  // ── Round-trip: reload, rebuild, re-serialize, assert byte-identical ───────
  const reloaded = JSON.parse(readFileSync(OUT_FILE, "utf8")) as GraphArtifact;
  const graph2 = deserializeGraph(reloaded);
  if (graph2.nodes.length !== graph.nodes.length) throw new Error("node count changed on reload");
  if (edgeCount(graph2) !== edgeCount(graph)) throw new Error("edge count changed on reload");
  const reserialized = JSON.stringify(serializeGraph(graph2, FRONT_RANGE_BBOX, ATTRIBUTION));
  // generatedAt differs by timestamp; compare everything else.
  const strip = (s: string): string => s.replace(/"generatedAt":"[^"]*"/, '"generatedAt":""');
  if (strip(reserialized) !== strip(json)) throw new Error("round-trip is not byte-identical");
  console.log("Round-trip: reloaded graph re-serializes identically ✓");

  // ── Snapping: a click near a known node snaps to it ────────────────────────
  const grid = buildGrid(graph2.nodes);
  // Pick a deterministic interior node and query a point offset ~30 m away from it.
  const target = graph2.nodes[Math.floor(graph2.nodes.length / 2)];
  const query = { lat: target.lat + 0.0002, lng: target.lng + 0.0002 }; // ~30 m NE
  const snapped = nearest(grid, query);
  console.log(
    `Snapping: query near node ${target.id} (${target.lat.toFixed(6)}, ${target.lng.toFixed(6)}) ` +
      `→ node ${snapped?.id} at ${snapped?.meters.toFixed(1)} m`,
  );
  if (!snapped || snapped.id !== target.id) {
    throw new Error(`snapping returned ${snapped?.id}, expected ${target.id}`);
  }
  // Also snap an exact node coordinate → distance ~0.
  const exact = nearest(grid, { lat: target.lat, lng: target.lng });
  if (!exact || exact.id !== target.id || exact.meters > 0.01) {
    throw new Error("exact-coordinate snap failed");
  }
  console.log("Snapping: exact-coordinate query returns distance ~0 ✓");

  // ── Recommendation ─────────────────────────────────────────────────────────
  // The log's gate (Decisions): "Tens of MB → client-side (zero backend). Much larger →
  // serverless." So the boundary is tens (< ~100 MB gz) vs hundreds. We flag a soft caution
  // above ~40 MB so V4 knows it can shrink further if the one-time load feels heavy.
  const gzMB = gzBytes / 1024 / 1024;
  const rec =
    gzMB < 100
      ? `CLIENT-SIDE: ${gzMB.toFixed(1)} MB gzipped is "tens of MB" — V4 loads it directly, zero backend.` +
        (gzMB > 40
          ? " (On the higher end; V4 may later shrink via typed-array binary or tiling if load feels heavy.)"
          : "")
      : "SERVERLESS: hundreds of MB gzipped — V4 should fetch via a thin serverless function or split by tile.";
  console.log(`\nDECISION GATE → ${rec}`);
}

main();
