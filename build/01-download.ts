// Stage 1 — Acquire the raw OSM data deterministically.
//
// Downloads the Geofabrik Colorado `.osm.pbf` to build/data/, skipping the download if the
// file is already present. Prints the size and a SHA-256 checksum so a rerun is verifiable.
//
// Run: npx tsx build/01-download.ts
//
// Clipping to the Front Range bbox: `osmium extract` is the preferred tool, but it is not
// available in this build environment. We therefore take the documented fallback — the bbox
// clip happens inside the Stage 2 streaming parse (see build/02-parse-filter.ts), which
// discards any node outside FRONT_RANGE_BBOX as it reads. No intermediate frontrange.osm.pbf
// is written; the clipped, filtered result is build/data/filtered.json.

import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { COLORADO_EXTRACT_URL, COLORADO_PBF, DATA_DIR } from "./config";

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

async function sha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

async function download(url: string, dest: string): Promise<void> {
  process.stdout.write(`Downloading ${url}\n`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) {
    throw new Error(`download failed: HTTP ${res.status} ${res.statusText}`);
  }
  const total = Number(res.headers.get("content-length") ?? 0);
  let seen = 0;
  const body = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
  body.on("data", (chunk: Buffer) => {
    seen += chunk.length;
    if (total) {
      const pct = ((seen / total) * 100).toFixed(0);
      process.stdout.write(`\r  ${humanBytes(seen)} / ${humanBytes(total)} (${pct}%)`);
    }
  });
  await pipeline(body, createWriteStream(dest));
  process.stdout.write("\n");
}

async function main(): Promise<void> {
  mkdirSync(DATA_DIR, { recursive: true });

  if (existsSync(COLORADO_PBF)) {
    console.log(`Already present: ${COLORADO_PBF} (skipping download)`);
  } else {
    await download(COLORADO_EXTRACT_URL, COLORADO_PBF);
  }

  const size = statSync(COLORADO_PBF).size;
  const checksum = await sha256(COLORADO_PBF);
  console.log(`File:     ${COLORADO_PBF}`);
  console.log(`Size:     ${humanBytes(size)} (${size} bytes)`);
  console.log(`SHA-256:  ${checksum}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
