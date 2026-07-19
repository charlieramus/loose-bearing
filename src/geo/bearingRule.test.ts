import { describe, it, expect } from "vitest";
import { isBearingLegal } from "./bearingRule";

describe("isBearingLegal — the 90° rule", () => {
  it("legal at 0° difference (dead straight toward the destination)", () => {
    expect(isBearingLegal(90, 90)).toBe(true);
  });

  it("legal at 89.9° (just inside)", () => {
    expect(isBearingLegal(179.9, 90)).toBe(true);
  });

  it("legal at EXACTLY 90.0° (perpendicular turn is allowed — the inclusive boundary)", () => {
    expect(isBearingLegal(180, 90)).toBe(true);
    expect(isBearingLegal(0, 90)).toBe(true);
  });

  it("illegal at 90.1° (just past the boundary)", () => {
    expect(isBearingLegal(180.1, 90)).toBe(false);
  });

  it("illegal at 180° (pointing straight back)", () => {
    expect(isBearingLegal(270, 90)).toBe(false);
  });

  it("wraparound: edge 350°, dest 20° → 30° diff → legal", () => {
    expect(isBearingLegal(350, 20)).toBe(true);
  });
});
