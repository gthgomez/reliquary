import { PNG } from "pngjs";
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public/icons");
mkdirSync(outDir, { recursive: true });

/** Reliquary palette from favicon.svg */
const INK = [0x14, 0x11, 0x0e, 255];
const COPPER = [0xa3, 0x6a, 0x45, 255];
const PARCHMENT = [0xf3, 0xea, 0xd8, 255];
const VERDANT = [0x2c, 0x3d, 0x32, 255];

function setPixel(png, x, y, rgba) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const i = (png.width * y + x) << 2;
  png.data[i] = rgba[0];
  png.data[i + 1] = rgba[1];
  png.data[i + 2] = rgba[2];
  png.data[i + 3] = rgba[3];
}

function drawIcon(size, maskable) {
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      setPixel(png, x, y, INK);
    }
  }
  const pad = maskable ? Math.floor(size * 0.1) : 0;
  const inner = size - pad * 2;
  const cx = size / 2;
  const roofY = pad + inner * 0.22;
  const baseY = pad + inner * 0.82;
  for (let y = pad; y < pad + inner; y++) {
    for (let x = pad; x < pad + inner; x++) {
      const nx = (x - cx) / (inner * 0.5);
      const ny = (y - roofY) / (baseY - roofY);
      if (ny >= 0 && ny <= 1 && Math.abs(nx) <= 1 - ny * 0.35) {
        setPixel(png, x, y, COPPER);
      }
      if (y >= roofY && y <= roofY + inner * 0.06 && Math.abs(nx) <= 0.95) {
        setPixel(png, x, y, VERDANT);
      }
      if (ny > 0.35 && ny < 0.65 && Math.abs(nx) < 0.18) {
        setPixel(png, x, y, PARCHMENT);
      }
    }
  }
  return PNG.sync.write(png);
}

/**
 * Concurrent readers (node --test runs test files in parallel) must never see
 * a half-written PNG: writeFileSync truncates in place, so a reader can catch
 * the file mid-write. Stage outside public/ on the same filesystem and
 * rename(2) into place — a reader sees the old bytes or the new ones.
 */
const stage = mkdtempSync(join(root, ".icons-stage-"));
try {
  writeFileSync(join(stage, "icon-192.png"), drawIcon(192, false));
  renameSync(join(stage, "icon-192.png"), join(outDir, "icon-192.png"));
  writeFileSync(join(stage, "icon-512.png"), drawIcon(512, false));
  renameSync(join(stage, "icon-512.png"), join(outDir, "icon-512.png"));
  writeFileSync(join(stage, "icon-maskable-512.png"), drawIcon(512, true));
  renameSync(join(stage, "icon-maskable-512.png"), join(outDir, "icon-maskable-512.png"));
} finally {
  rmSync(stage, { recursive: true, force: true });
}
console.log("[icons] wrote Reliquary 192/512/maskable PNGs");
