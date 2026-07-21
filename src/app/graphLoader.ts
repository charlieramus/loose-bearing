// Runtime graph loader (V4, Stage 2). Per V2's recorded recommendation in NOW.md — the
// artifact is 99.9 MB raw / 31.1 MB gzipped, so we LOAD IT CLIENT-SIDE with zero backend —
// this fetches `public/graph/frontrange.graph.json` directly, validates it against V2's
// serialization schema, and reconstructs the `Graph` (via the SAME `deserializeGraph`) plus
// the snapping `Grid` (via the SAME `buildGrid`) the router and geocoding stages consume.
//
// The load is single-sourced and cached for the session: the first success is memoized so
// later stages call `cachedGraph()` without re-fetching or re-parsing 100 MB. The `fetcher`
// seam keeps the client-vs-serverless choice swappable (a thin serverless endpoint could
// return the same artifact JSON) and makes the loader unit-testable without the real file.
//
// Any failure — 404 / bad path, network error, malformed or wrong-version artifact — collapses
// to the taxonomy's `GraphLoadError` state (never a blank map or a silent console throw).

import {
  ARTIFACT_VERSION,
  deserializeGraph,
  type GraphArtifact,
} from "../../build/serialize";
import { buildGrid, type Grid } from "../../build/spatial";
import type { Graph } from "../graph/types";

/** Path is relative (no leading slash) so the app works under any base path / static host. */
export const GRAPH_URL = "graph/frontrange.graph.json";

export type GraphMeta = {
  nodeCount: number;
  edgeCount: number;
  bbox: GraphArtifact["bbox"];
  attribution: string;
  generatedAt: string;
};

export type LoadedGraph = {
  graph: Graph;
  grid: Grid;
  meta: GraphMeta;
};

/** The load either yields the reconstructed graph or the one taxonomy load state. */
export type GraphLoadOutcome =
  | { ok: true; data: LoadedGraph }
  | { ok: false; reason: "GraphLoadError"; detail: string };

/** Swappable transport: returns the parsed artifact (client fetch by default). */
export type ArtifactFetcher = (signal?: AbortSignal) => Promise<GraphArtifact>;

let cache: LoadedGraph | null = null;

/** The session-cached graph, or null if it hasn't loaded successfully yet. */
export function cachedGraph(): LoadedGraph | null {
  return cache;
}

/** Test-only: drop the memoized graph so a fresh load re-runs. */
export function __resetGraphCache(): void {
  cache = null;
}

async function fetchArtifact(url: string, signal?: AbortSignal): Promise<GraphArtifact> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  return (await res.json()) as GraphArtifact;
}

/**
 * Structural check against V2's CSR schema. Cheap O(1) guards only — we do NOT walk every
 * edge (that's what the offline `06-validate` step is for); we just refuse an artifact that
 * would corrupt `deserializeGraph` (wrong version, missing/mismatched parallel arrays).
 */
function validateArtifact(a: GraphArtifact): void {
  if (!a || typeof a !== "object") throw new Error("artifact is not an object");
  if (a.version !== ARTIFACT_VERSION) {
    throw new Error(`artifact version ${a.version} != expected ${ARTIFACT_VERSION}`);
  }
  const arrays: [keyof GraphArtifact, number][] = [
    ["lat", a.nodeCount],
    ["lng", a.nodeCount],
    ["offsets", a.nodeCount + 1],
    ["edgeTo", a.edgeCount],
    ["edgeBearing", a.edgeCount],
    ["edgeLength", a.edgeCount],
  ];
  for (const [name, expected] of arrays) {
    const arr = a[name];
    if (!Array.isArray(arr)) throw new Error(`artifact.${String(name)} is not an array`);
    if (arr.length !== expected) {
      throw new Error(`artifact.${String(name)} length ${arr.length} != expected ${expected}`);
    }
  }
  if (a.offsets[a.nodeCount] !== a.edgeCount) {
    throw new Error(`offsets tail ${a.offsets[a.nodeCount]} != edgeCount ${a.edgeCount}`);
  }
}

/**
 * Load, validate, reconstruct, and cache the Front Range graph. Returns `GraphLoadError` on
 * any failure rather than throwing, so the UI can show the state + a retry. Pass `force` to
 * bypass the session cache (used by the retry affordance), or a custom `fetcher`/`url`.
 */
export async function loadGraph(opts?: {
  url?: string;
  fetcher?: ArtifactFetcher;
  signal?: AbortSignal;
  force?: boolean;
}): Promise<GraphLoadOutcome> {
  if (cache && !opts?.force) return { ok: true, data: cache };
  try {
    const artifact = opts?.fetcher
      ? await opts.fetcher(opts.signal)
      : await fetchArtifact(opts?.url ?? GRAPH_URL, opts?.signal);
    validateArtifact(artifact);
    const graph = deserializeGraph(artifact);
    const grid = buildGrid(graph.nodes);
    const data: LoadedGraph = {
      graph,
      grid,
      meta: {
        nodeCount: artifact.nodeCount,
        edgeCount: artifact.edgeCount,
        bbox: artifact.bbox,
        attribution: artifact.attribution,
        generatedAt: artifact.generatedAt,
      },
    };
    cache = data;
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      reason: "GraphLoadError",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
