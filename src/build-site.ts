import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "dist-site");

// Output is a plain static folder -- any static host can publish it as-is.
// Only the two files the browser actually reads are copied from cache/, not
// the multi-MB raw-*.json feeds.
await rm(out, { recursive: true, force: true });
await cp(path.join(root, "web"), out, { recursive: true });
await mkdir(path.join(out, "data"), { recursive: true });
for (const file of ["scoreboard.json", "sighting-scores.json"]) {
  await cp(path.join(root, "cache", file), path.join(out, "data", file));
}
console.log(`Built static site in ${out}`);
