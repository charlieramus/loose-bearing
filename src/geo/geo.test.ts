import { describe, it, expect } from "vitest";
import {
  haversineMeters,
  initialBearingDeg,
  angularDiffDeg,
  type LatLng,
} from "./geo";

const ORIGIN: LatLng = { lat: 0, lng: 0 };

describe("haversineMeters", () => {
  it("computes a known distance: 1° of latitude ≈ 111.19 km", () => {
    // One degree of latitude on the IUGG mean sphere ≈ 111,194.9 m.
    const d = haversineMeters(ORIGIN, { lat: 1, lng: 0 });
    expect(d).toBeCloseTo(111_194.93, 0); // within ~1 m
  });

  it("is symmetric and zero for identical points", () => {
    const a: LatLng = { lat: 40.015, lng: -105.27 }; // Boulder-ish
    const b: LatLng = { lat: 39.7392, lng: -104.9903 }; // Denver-ish
    expect(haversineMeters(a, a)).toBe(0);
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 6);
  });

  it("antipodal-ish sanity: ~half the Earth's circumference", () => {
    // Antipode of (10, 20) is (-10, -160). Distance ≈ π·R ≈ 20,015 km.
    const d = haversineMeters({ lat: 10, lng: 20 }, { lat: -10, lng: -160 });
    expect(d).toBeGreaterThan(20_000_000);
    expect(d).toBeLessThanOrEqual(20_015_115); // π·R upper bound
  });
});

describe("initialBearingDeg — cardinals from the origin", () => {
  it("due north ≈ 0", () => {
    expect(initialBearingDeg(ORIGIN, { lat: 1, lng: 0 })).toBeCloseTo(0, 6);
  });
  it("due east ≈ 90", () => {
    expect(initialBearingDeg(ORIGIN, { lat: 0, lng: 1 })).toBeCloseTo(90, 6);
  });
  it("due south ≈ 180", () => {
    expect(initialBearingDeg(ORIGIN, { lat: -1, lng: 0 })).toBeCloseTo(180, 6);
  });
  it("due west ≈ 270", () => {
    expect(initialBearingDeg(ORIGIN, { lat: 0, lng: -1 })).toBeCloseTo(270, 6);
  });

  it("is always normalized to [0, 360)", () => {
    const b = initialBearingDeg(ORIGIN, { lat: 0, lng: -1 });
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(360);
  });
});

describe("angularDiffDeg — 0/360 wraparound", () => {
  it("bearings just east and just west of north differ by 2°, not 358°", () => {
    // 1° (just east of north) vs 359° (just west of north).
    expect(angularDiffDeg(1, 359)).toBeCloseTo(2, 6);
    expect(angularDiffDeg(359, 1)).toBeCloseTo(2, 6);
  });

  it("wraps across the seam: 350° vs 20° → 30°", () => {
    expect(angularDiffDeg(350, 20)).toBeCloseTo(30, 6);
  });

  it("is symmetric and bounded to [0, 180]", () => {
    expect(angularDiffDeg(10, 200)).toBeCloseTo(angularDiffDeg(200, 10), 6);
    expect(angularDiffDeg(0, 180)).toBe(180); // exact opposite
    expect(angularDiffDeg(45, 45)).toBe(0); // identical
  });
});
