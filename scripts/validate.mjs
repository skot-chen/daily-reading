// Checks Part files before an AI pushes them to the notes repo.
// Usage: node scripts/validate.mjs <folder-or-file> [...]   e.g. node scripts/validate.mjs ../daily-reading-notes/parts
import fs from "node:fs";
import path from "node:path";
import { validatePart } from "../lib.js";

const args = process.argv.slice(2);
if (!args.length) { console.error("Usage: node scripts/validate.mjs <folder-or-file> [...]"); process.exit(2); }
let bad = 0, n = 0;
for (const a of args) {
  const files = fs.statSync(a).isDirectory()
    ? fs.readdirSync(a).filter((f) => f.endsWith(".json")).map((f) => path.join(a, f)) : [a];
  for (const f of files) {
    n++;
    let errs;
    try {
      const p = JSON.parse(fs.readFileSync(f, "utf8"));
      errs = validatePart(p);
      if (!errs.length && path.basename(f) !== p.video + ".json") errs = ["file name must be <video>.json (" + p.video + ".json)"];
    } catch (e) { errs = ["not valid JSON: " + e.message]; }
    if (errs.length) { bad++; console.error("✗ " + f + "\n  - " + errs.join("\n  - ")); }
    else console.log("✓ " + f);
  }
}
console.log(n + " file(s), " + bad + " with problems");
process.exit(bad ? 1 : 0);
