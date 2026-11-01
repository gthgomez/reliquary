import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const staticDir = join(root, ".vercel/output/static");

function fail(message) {
  console.error(`[verify:pwa] ${message}`);
  process.exit(1);
}

if (!existsSync(join(staticDir, "index.html"))) {
  fail("missing index.html — run npm run build:web");
}
if (!existsSync(join(staticDir, "sw.js"))) {
  fail("missing sw.js — run npm run build:web");
}
const html = readFileSync(join(staticDir, "index.html"), "utf8");
if (!html.includes("manifest.webmanifest")) fail("shell missing manifest link");
if ((html.match(/rel="manifest"/g) ?? []).length !== 1) fail("shell must contain exactly one manifest link");
console.log("[verify:pwa] static shell and service worker present");
