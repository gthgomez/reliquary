#!/usr/bin/env node
/**
 * Serve the built game shell and run every deep chapter journey headlessly.
 *
 * These journeys are the only automated playthrough of the natural chapter
 * loop (starter → bind → party management → save/reload → trial), which the
 * 20-line `journey.mjs` boot smoke does not cover. Each journey gets its own
 * evidence directory and every failure fails the run — a silently skipped
 * journey would be exactly the regression net this script exists to be.
 */
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const staticDir = join(root, ".vercel/output/static");
const evidenceRoot = process.env.RELIQUARY_QA_EVIDENCE ?? join(root, ".qa-evidence");
// ubuntu runners ship Chrome (not Edge); Edge is the default for Windows/dev.
const channel = process.env.RELIQUARY_QA_CHANNEL ?? "msedge";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
};

/**
 * Async spawn: the static server lives on this process's event loop, so a
 * spawnSync here would block the loop and starve every journey request.
 */
function run(cmd, cmdArgs, env, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(cmd, cmdArgs, {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
    const label = cmdArgs.at(-2) ?? cmd;
    const timer = setTimeout(() => {
      console.error(`[journeys] ${label} exceeded ${Math.round(timeoutMs / 1000)}s — killing process tree`);
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        child.kill("SIGKILL");
      }
      resolve(false);
    }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      console.error(`[journeys] ${label} could not start: ${error.message}`);
      resolve(false);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

async function main() {
  if (!existsSync(join(staticDir, "index.html"))) {
    console.error("[journeys] no built shell — build with scripts/build-web-test.mjs first");
    process.exit(1);
  }

  const server = createServer((req, res) => {
    const path = (req.url ?? "/").split("?", 1)[0] ?? "/";
    const rel = path === "/" ? "index.html" : path.replace(/^\//, "");
    const filePath = join(staticDir, rel);
    if (!filePath.startsWith(staticDir) || !existsSync(filePath)) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    const body = readFileSync(filePath);
    res.writeHead(200, { "content-type": MIME[extname(filePath)] ?? "application/octet-stream" });
    res.end(body);
  });
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
    server.listen(0, "127.0.0.1");
  });
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}`;
  console.log(`[journeys] serving ${staticDir} at ${url} (browser channel: ${channel})`);

  // Order matters: the natural journeys are the primary evidence; the fixture
  // journeys use the diagnostic probe and prepared saves (not natural play).
  const journeys = [
    ["chapter-one-qa.mjs", 20 * 60_000],
    ["natural-journey-qa.mjs", 15 * 60_000],
    ["save-transfer-qa.mjs", 10 * 60_000],
    ["gameplay-qa.mjs", 10 * 60_000],
    ["chapter-one-fixture-qa.mjs", 15 * 60_000],
  ];

  let failed = 0;
  for (const [file, timeoutMs] of journeys) {
    const evidence = join(evidenceRoot, file.replace(/\.mjs$/, ""));
    mkdirSync(evidence, { recursive: true });
    console.log(`[journeys] running ${file}`);
    const ok = await run(
      process.execPath,
      [join(root, "scripts", file), url, evidence],
      { RELIQUARY_QA_CHANNEL: channel },
      timeoutMs,
    );
    if (ok) {
      console.log(`[journeys] PASS ${file}`);
    } else {
      console.error(`[journeys] FAIL ${file} (evidence: ${evidence})`);
      failed += 1;
    }
  }
  server.close();
  if (failed) {
    console.error(`[journeys] ${failed}/${journeys.length} journeys failed`);
    process.exit(1);
  }
  console.log(`[journeys] all ${journeys.length} journeys passed`);
}

main();
