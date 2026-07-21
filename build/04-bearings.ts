// Stage 4 — Precompute edge bearings and lengths.
//
// Builds the graph (Stage 3), attaches each directed edge's chord bearing via the V1 geo core,
// and verifies: bearings are all in [0, 360); a sample of edges whose real-world orientation is
// obvious from their endpoints reads the expected compass direction (E–W ≈ 90/270, N–S ≈ 0/180);
// and every two-way street's opposite edges are ~180° apart.
//
// Run: npx tsx --max-old-space-size=8192 build/04-bearings.ts

import { angularDiffDeg } from "../src/geo/geo";
import { outEdges } from "../src/graph/types";
import { attachBearings, buildGraph, edgeCount, loadFiltered } from "./graph";

function main(): void {
  const f = loadFiltered();
  const graph = buildGraph(f);
  attachBearings(graph);

  const nEdges = edgeCount(graph);
  console.log(`Attached bearings to ${nEdges} edges.`);

  // Flat list of edges for sampling.
  const edges = [...graph.adjacency.values()].flat();
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

  // ── Range invariant: all bearings in [0, 360) ─────────────────────────────
  let outOfRange = 0;
  let minB = Infinity;
  let maxB = -Infinity;
  for (const e of edges) {
    if (!(e.bearingDeg >= 0 && e.bearingDeg < 360)) outOfRange++;
    minB = Math.min(minB, e.bearingDeg);
    maxB = Math.max(maxB, e.bearingDeg);
  }
  console.log(`Bearing range: [${minB.toFixed(3)}, ${maxB.toFixed(3)}], out-of-range: ${outOfRange}`);
  if (outOfRange > 0) throw new Error("some bearings fell outside [0, 360)");

  // ── Eyeball check: strongly axis-aligned edges read the right compass value ─
  // Pick edges where one axis dominates the other by ≥8× so the orientation is unambiguous,
  // then confirm the stored bearing lands in the expected quadrant.
  const checked: string[] = [];
  let ewChecked = 0;
  let nsChecked = 0;
  for (const e of edges) {
    if (ewChecked >= 3 && nsChecked >= 3) break;
    const a = nodeById.get(e.from)!;
    const b = nodeById.get(e.to)!;
    const dLat = Math.abs(b.lat - a.lat);
    const dLng = Math.abs(b.lng - a.lng);
    if (dLng > dLat * 8 && dLng > 0.001 && ewChecked < 3) {
      // East–west edge: expect ~90 (eastward) or ~270 (westward).
      const near90 = angularDiffDeg(e.bearingDeg, 90) <= 15;
      const near270 = angularDiffDeg(e.bearingDeg, 270) <= 15;
      checked.push(
        `E–W edge ${e.from}→${e.to} bearing ${e.bearingDeg.toFixed(1)}° ` +
          `(${near90 ? "≈90 eastbound" : near270 ? "≈270 westbound" : "UNEXPECTED"})`,
      );
      if (!near90 && !near270) throw new Error("east–west edge bearing not ~90/270");
      ewChecked++;
    } else if (dLat > dLng * 8 && dLat > 0.001 && nsChecked < 3) {
      // North–south edge: expect ~0/360 (northward) or ~180 (southward).
      const near0 = angularDiffDeg(e.bearingDeg, 0) <= 15;
      const near180 = angularDiffDeg(e.bearingDeg, 180) <= 15;
      checked.push(
        `N–S edge ${e.from}→${e.to} bearing ${e.bearingDeg.toFixed(1)}° ` +
          `(${near0 ? "≈0 northbound" : near180 ? "≈180 southbound" : "UNEXPECTED"})`,
      );
      if (!near0 && !near180) throw new Error("north–south edge bearing not ~0/180");
      nsChecked++;
    }
  }
  console.log("Eyeball-orientation checks:");
  for (const line of checked) console.log("  " + line);

  // ── Opposite-edge ~180° property across a sample ──────────────────────────
  let pairs = 0;
  let worst = 0;
  for (const e of edges) {
    const back = outEdges(graph, e.to).find((x) => x.to === e.from);
    if (!back) continue;
    pairs++;
    const dev = Math.abs(angularDiffDeg(e.bearingDeg, back.bearingDeg) - 180);
    worst = Math.max(worst, dev);
  }
  console.log(
    `Opposite-edge check: ${pairs} bidirectional edges; max deviation from 180° = ` +
      `${worst.toFixed(4)}°`,
  );
  // Tiny slack for spherical/float effects on very short edges.
  if (worst > 0.5) throw new Error(`opposite edges deviate from 180° by ${worst.toFixed(3)}°`);
  console.log("Opposite edges are ~180° apart ✓");
}

main();
