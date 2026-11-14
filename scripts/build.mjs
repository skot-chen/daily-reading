// Syntax-checks the site's JS and copies the static files to _site/ (what GitHub Pages publishes).
// Usage: node scripts/build.mjs
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const site = path.join(root, "_site");
const files = ["index.html", "style.css", "app.js", "lib.js"];

for (const f of files) {
  if (!fs.existsSync(path.join(root, f))) { console.error("Missing " + f); process.exit(1); }
  if (f.endsWith(".js")) execFileSync(process.execPath, ["--check", path.join(root, f)], { stdio: "inherit" });
}
fs.rmSync(site, { recursive: true, force: true });
fs.mkdirSync(site);
for (const f of files) fs.copyFileSync(path.join(root, f), path.join(site, f));
fs.writeFileSync(path.join(site, ".nojekyll"), "");
console.log("Built _site/ (" + files.length + " files)");
