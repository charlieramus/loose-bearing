// Permalinks (V4, Stage 7). A route is fully determined by its (start, end) coordinates because
// V3's router is deterministic, so a shareable link is nearly free: encode the two SNAPPED
// endpoint coordinates in the URL hash and, on load, decode → clamp → resolve them back to the
// same nodes → the same path + detour factor.
//
// Encoding uses the snapped node coordinates (6 dp, matching the artifact's coord rounding); on
// reload, snapping a node's own coordinate returns that node, so reproduction is exact.
//
// Robustness: `parsePermalink` is pure and total — non-numeric / missing coordinates return null
// (the app falls back to the default view, never feeding undefined into snap/search); numeric but
// out-of-region coordinates are CLAMPED into the Front Range bbox (the shared `region` constant).

import type { LatLng } from "../geo/geo";
import { clampToBBox } from "../geo/region";

export type PermalinkPair = { origin: LatLng; dest: LatLng };

const DP = 6;
const round = (x: number): number => Math.round(x * 10 ** DP) / 10 ** DP;
const fmt = (p: LatLng): string => `${round(p.lat)},${round(p.lng)}`;

/** Encode a pair as the URL hash body: `a=lat,lng&b=lat,lng` (no leading '#'). */
export function encodePermalink(origin: LatLng, dest: LatLng): string {
  const params = new URLSearchParams();
  params.set("a", fmt(origin));
  params.set("b", fmt(dest));
  return params.toString();
}

/** Parse one `lat,lng` token into finite numbers, or null if malformed. */
function parseLatLng(token: string | null): LatLng | null {
  if (!token) return null;
  const parts = token.split(",");
  if (parts.length !== 2) return null;
  const lat = Number.parseFloat(parts[0]);
  const lng = Number.parseFloat(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/**
 * Decode a hash/query string into a clamped pair, or null if either endpoint is garbage. Accepts
 * an optional leading '#' or '?'. Pure — safe to unit-test and to call with any user-controlled
 * string.
 */
export function parsePermalink(raw: string): PermalinkPair | null {
  const body = raw.replace(/^[#?]/, "");
  if (body.length === 0) return null;
  const params = new URLSearchParams(body);
  const a = parseLatLng(params.get("a"));
  const b = parseLatLng(params.get("b"));
  if (!a || !b) return null; // reject garbage — caller falls back to the default view
  return {
    origin: clampToBBox(a.lat, a.lng),
    dest: clampToBBox(b.lat, b.lng),
  };
}

/** Read the current location hash into a pair (browser). */
export function readPermalink(): PermalinkPair | null {
  if (typeof location === "undefined") return null;
  return parsePermalink(location.hash);
}

/**
 * Write the pair to the URL hash without adding a history entry (replaceState), so recomputing a
 * route as pins move doesn't spam the back button.
 */
export function writePermalink(origin: LatLng, dest: LatLng): void {
  if (typeof history === "undefined") return;
  const hash = `#${encodePermalink(origin, dest)}`;
  history.replaceState(null, "", hash);
}
