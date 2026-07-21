// Stage 8 coherence guard: the app layer must NOT reimplement geo/rule math — it imports V1's
// geo core (haversine, initial bearing) and V3's router (which owns the 90° legality predicate)
// and never recomputes bearings, distances, or legality itself. This scans the app source so the
// DRY invariant can't silently regress in a later stage/log.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const appDir = dirname(fileURLToPath(import.meta.url));
const sourceFiles = readdirSync(appDir).filter(
  (f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "vite-env.d.ts",
);

// Fingerprints of the geo/rule math that lives ONLY in src/geo — if any appears in the app
// layer, someone has re-derived what should be imported.
const FORBIDDEN: { pattern: RegExp; what: string }[] = [
  { pattern: /Math\.atan2/, what: "bearing via atan2 (use initialBearingDeg)" },
  { pattern: /EARTH_RADIUS|6_371_008|6371008/, what: "haversine earth radius (use haversineMeters)" },
  { pattern: /\btoRad\b|\btoDeg\b/, what: "degree/radian conversion (belongs in the geo core)" },
  { pattern: /function\s+angularDiff|angularDiffDeg\s*=/, what: "angular-difference reimpl" },
  { pattern: /\bisBearingLegal\b/, what: "the 90° rule (owned by the router)" },
];

describe("app layer does not reimplement geo/rule math (DRY)", () => {
  for (const file of sourceFiles) {
    const src = readFileSync(join(appDir, file), "utf8");
    it(`${file} is clean`, () => {
      for (const { pattern, what } of FORBIDDEN) {
        expect(pattern.test(src), `${file} appears to reimplement ${what}`).toBe(false);
      }
    });
  }

  it("scanned a meaningful number of app files", () => {
    expect(sourceFiles.length).toBeGreaterThan(8);
  });
});
