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
// Stamp a version on every file reference so a browser never mixes an old page with new code after an update.
// The git commit is stable between rebuilds (the local dev server rebuilds on every page load).
let v = "dev";
try { v = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim() || "dev"; } catch { /* no git */ }
for (const f of files) {
  let s = fs.readFileSync(path.join(root, f), "utf8");
  if (f === "index.html") s = s.replace(/(href|src)="(style\.css|app\.js)"/g, `$1="$2?v=${v}"`)
    .replace('<meta name="build" content="dev">', `<meta name="build" content="${v}">`);
  if (f === "app.js") s = s.replace(/from "\.\/lib\.js"/g, `from "./lib.js?v=${v}"`);
  fs.writeFileSync(path.join(site, f), s);
}
fs.writeFileSync(path.join(site, ".nojekyll"), "");
console.log("Built _site/ (" + files.length + " files)");
