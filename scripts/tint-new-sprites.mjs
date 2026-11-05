import { PNG } from "pngjs";
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const spriteDir = join(root, "public/game/sprites");

/** Distinct tints for new species (source file → RGB multipliers). */
const RECIPES = [
  ["dewslime.png", "mirewhelp.png", [1.15, 0.95, 1.25]],
  ["bogslime.png", "bogwallow.png", [0.85, 1.1, 0.9]],
  ["slime_king.png", "bogwallow.png", [1.2, 0.75, 1.05]],
  ["gutterrat.png", "gravepup.png", [1.05, 1.05, 0.75]],
  ["gravegnaw.png", "gravepup.png", [0.9, 0.85, 0.95]],
  ["blighted_gravepup.png", "gravepup.png", [0.75, 1.05, 0.8]],
  ["ashforged_ironnewt.png", "ironnewt.png", [1.15, 0.9, 0.75]],
];

function tintPixels(source, mult) {
  const out = new PNG({ width: source.width, height: source.height });
  for (let i = 0; i < source.data.length; i += 4) {
    out.data[i] = Math.min(255, Math.round(source.data[i] * mult[0]));
    out.data[i + 1] = Math.min(255, Math.round(source.data[i + 1] * mult[1]));
    out.data[i + 2] = Math.min(255, Math.round(source.data[i + 2] * mult[2]));
    out.data[i + 3] = source.data[i + 3];
  }
  return out;
}

// Stage + rename(2): concurrent test files read these PNGs while they are
// regenerated, and writeFileSync truncates in place (half-read risk).
const stage = mkdtempSync(join(root, ".sprites-stage-"));
try {
  for (const [dest, src, mult] of RECIPES) {
    const srcPath = join(spriteDir, src);
    if (!existsSync(srcPath)) {
      console.error(`[sprites] missing source ${src}`);
      process.exit(1);
    }
    const png = PNG.sync.read(readFileSync(srcPath));
    const stagedPath = join(stage, dest);
    writeFileSync(stagedPath, PNG.sync.write(tintPixels(png, mult)));
    renameSync(stagedPath, join(spriteDir, dest));
  }
} finally {
  rmSync(stage, { recursive: true, force: true });
}
console.log(`[sprites] tinted ${RECIPES.length} new species PNGs`);
