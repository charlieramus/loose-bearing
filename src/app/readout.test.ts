// Stage 6 verification: the readout's numeric behavior — the detour meter fills proportionally
// (empty when the rule doesn't bind, full when the route is 3×+), distances/bearings format as
// the terse instrument figures. The DOM view itself is thin; the logic worth pinning is here.

import { describe, it, expect } from "vitest";
import { fmtDist, fmtBearing, meterFill } from "./readout";

describe("meterFill (detour meter proportionality)", () => {
  it("is empty when the rule does not bind (~1.0×)", () => {
    expect(meterFill(1.0)).toBe(0);
    expect(meterFill(1.02)).toBe(0);
  });
  it("fills proportionally as the detour grows", () => {
    expect(meterFill(1.43)).toBe(3); // the known detour fixture → a few segments
    expect(meterFill(2.0)).toBe(8); // halfway
  });
  it("rails full at/above 3×", () => {
    expect(meterFill(3.0)).toBe(16);
    expect(meterFill(5.0)).toBe(16);
  });
});

describe("fmtDist", () => {
  it("uses meters below 1 km and km at/above", () => {
    expect(fmtDist(420)).toBe("420 M");
    expect(fmtDist(2500)).toBe("2.50 KM");
  });
});

describe("fmtBearing", () => {
  it("zero-pads to 3 digits and normalizes", () => {
    expect(fmtBearing(47)).toBe("047°");
    expect(fmtBearing(0)).toBe("000°");
    expect(fmtBearing(-10)).toBe("350°");
    expect(fmtBearing(360)).toBe("000°");
  });
});
