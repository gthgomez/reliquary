/**
 * Sample game-canvas luminance contrast for battle/overworld evidence.
 * Outputs JSON: foe/player band vs backdrop, path vs grass on overworld.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function relLum(r, g, b) {
  const s = [r, g, b].map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
}

function contrast(l1, l2) {
  const a = Math.max(l1, l2);
  const b = Math.min(l1, l2);
  return (a + 0.05) / (b + 0.05);
}

function sampleRect(png, x, y, w, h) {
  let rs = 0;
  let gs = 0;
  let bs = 0;
  let n = 0;
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(png.width, Math.floor(x + w));
  const y1 = Math.min(png.height, Math.floor(y + h));
  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) {
      const i = (png.width * py + px) << 2;
      rs += png.data[i];
      gs += png.data[i + 1];
      bs += png.data[i + 2];
      n += 1;
    }
  }
  if (!n) return 0;
  return relLum(rs / n, gs / n, bs / n);
}

function loadPng(path) {
  return PNG.sync.read(readFileSync(path));
}

function metricsForScreenshot(path, kind) {
  const png = loadPng(path);
  const w = png.width;
  const h = png.height;
  if (kind === "battle") {
    const backdrop = sampleRect(png, w * 0.55, h * 0.12, w * 0.35, h * 0.22);
    const foeBand = sampleRect(png, w * 0.45, h * 0.08, w * 0.4, h * 0.28);
    const playerBand = sampleRect(png, w * 0.05, h * 0.22, w * 0.35, h * 0.22);
    const floorUi = sampleRect(png, w * 0.1, h * 0.55, w * 0.8, h * 0.12);
    return {
      kind,
      width: w,
      height: h,
      foeVsBackdrop: Number(contrast(foeBand, backdrop).toFixed(2)),
      playerVsBackdrop: Number(contrast(playerBand, backdrop).toFixed(2)),
      floorWashVsBackdrop: Number(contrast(floorUi, backdrop).toFixed(2)),
    };
  }
  const grass = sampleRect(png, w * 0.15, h * 0.35, w * 0.2, h * 0.15);
  const pathBand = sampleRect(png, w * 0.42, h * 0.38, w * 0.16, h * 0.2);
  const actor = sampleRect(png, w * 0.44, h * 0.42, w * 0.12, h * 0.12);
  return {
    kind,
    width: w,
    height: h,
    pathVsGrass: Number(contrast(pathBand, grass).toFixed(2)),
    actorVsGrass: Number(contrast(actor, grass).toFixed(2)),
  };
}

const beforeDir = process.argv[2];
const afterDir = process.argv[3];
const outPath = process.argv[4] ?? join(root, "docs/implementation/evidence/visual-clarity/readability.json");
if (!beforeDir || !afterDir) {
  console.error("usage: node scripts/visual-readability-metrics.mjs <before-dir> <after-dir> [out.json]");
  process.exit(1);
}

const shots = [
  "phone-portrait-battle.png",
  "phone-portrait-wildwood.png",
  "short-portrait-battle.png",
  "short-portrait-wildwood.png",
  "phone-landscape-battle.png",
];

const report = { beforeDir, afterDir, pairs: [] };
mkdirSync(dirname(outPath), { recursive: true });

for (const file of shots) {
  const b = join(beforeDir, file);
  const a = join(afterDir, file);
  if (!existsSync(b) || !existsSync(a)) continue;
  const kind = file.includes("battle") ? "battle" : "wildwood";
  report.pairs.push({
    file,
    before: metricsForScreenshot(b, kind),
    after: metricsForScreenshot(a, kind),
  });
}

writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
