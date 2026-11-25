/** Prepare the original Quiet Lantern inn drawing for the 32px tile renderer. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";

const [sourcePath, outputPath] = process.argv.slice(2);
assert.ok(sourcePath && outputPath, "Usage: node scripts/prepare-elderhall-inn.mjs source.png output.png");
const source = readFileSync(sourcePath);
const sourceHash = createHash("sha256").update(source).digest("hex");
assert.equal(sourceHash, "53baac29ff5c7b54ce4b1c32654bd33b258cce0515a14e15082b1dced55ff5bb",
  "Expected the original Quiet Lantern drawing");
const image = PNG.sync.read(source, { checkCRC: true });
const alphaThreshold = 128;
let left = image.width, right = 0, top = image.height, bottom = 0;
for (let y = 0; y < image.height; y += 1) {
  for (let x = 0; x < image.width; x += 1) {
    if (image.data[(y * image.width + x) * 4 + 3] < alphaThreshold) continue;
    left = Math.min(left, x);
    right = Math.max(right, x + 1);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y + 1);
  }
}

const output = new PNG({ width: 160, height: 156 });
// Allocate more of the native raster to the facade so the door reads beside
// a full-size player. Preserve the gables and keep the last step at baseline.
const facadeStart = 752;
const sourceBands = [
  { top, bottom: facadeStart, height: 69 },
  { top: facadeStart, bottom, height: 77 },
];
const width = 152;
let startY = 6;
for (const band of sourceBands) {
  for (let y = 0; y < band.height; y += 1) {
    const sy = band.top + Math.floor((y + 0.5) * (band.bottom - band.top) / band.height);
    for (let x = 0; x < width; x += 1) {
      const sx = left + Math.floor((x + 0.5) * (right - left) / width);
      const index = (sy * image.width + sx) * 4;
      if (image.data[index + 3] < alphaThreshold) continue;
      const target = ((startY + y) * output.width + x + 4) * 4;
      image.data.copy(output.data, target, index, index + 3);
      output.data[target + 3] = 255;
    }
  }
  startY += band.height;
}
writeFileSync(outputPath, PNG.sync.write(output, { filterType: 4 }));
