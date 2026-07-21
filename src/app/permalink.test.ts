// Stage 7 verification: encode → decode round-trips exactly (so a shared link reproduces the
// same coordinates → the same deterministic route), out-of-region coordinates are clamped into
// the Front Range bbox, and garbage is rejected as null (the app falls back to the default view
// instead of feeding undefined coords into snap/search).

import { describe, it, expect } from "vitest";
import { encodePermalink, parsePermalink } from "./permalink";
import { FRONT_RANGE_BBOX, inBBox } from "../geo/region";

const A = { lat: 39.739236, lng: -104.990251 }; // Denver
const B = { lat: 40.014986, lng: -105.270546 }; // Boulder

describe("encode / decode round-trip", () => {
  it("reproduces the same in-region coordinates exactly (6 dp)", () => {
    const pair = parsePermalink("#" + encodePermalink(A, B));
    expect(pair).not.toBeNull();
    expect(pair!.origin).toEqual(A);
    expect(pair!.dest).toEqual(B);
  });

  it("accepts a leading '?' or bare body too", () => {
    const body = encodePermalink(A, B);
    expect(parsePermalink("?" + body)).not.toBeNull();
    expect(parsePermalink(body)).not.toBeNull();
  });
});

describe("clamp out-of-region coordinates", () => {
  it("pulls a far-away but numeric coordinate into the bbox", () => {
    // London — well outside the Front Range.
    const pair = parsePermalink("#a=51.5074,-0.1278&b=39.74,-104.99");
    expect(pair).not.toBeNull();
    expect(inBBox(pair!.origin.lat, pair!.origin.lng)).toBe(true);
    // Clamped to the nearest bbox corner/edge.
    expect(pair!.origin.lat).toBe(FRONT_RANGE_BBOX.maxLat);
    expect(pair!.origin.lng).toBe(FRONT_RANGE_BBOX.maxLng);
  });
});

describe("reject garbage gracefully", () => {
  it("returns null for non-numeric, missing, or empty input", () => {
    expect(parsePermalink("#a=foo,bar&b=1,2")).toBeNull();
    expect(parsePermalink("#a=39.7,-104.9")).toBeNull(); // missing b
    expect(parsePermalink("#b=39.7,-104.9")).toBeNull(); // missing a
    expect(parsePermalink("#a=39.7&b=40,-105")).toBeNull(); // malformed a (one number)
    expect(parsePermalink("")).toBeNull();
    expect(parsePermalink("#")).toBeNull();
  });
});
