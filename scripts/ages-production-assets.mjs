import { readdirSync } from "node:fs";
import { basename } from "node:path";

const previewFiles = new Set([
  "sprite.runtime.json",
  "candidate_pack.json",
  "external-import.json",
  "source-declaration.json",
  "source-provenance.json",
]);
const sourceExtensions = /\.(pxo|efkproj|efkefc|efkmodel|efkmat|aseprite|ase|ora|kra)$/;

/** @param {string} directory */
export function assertNoAgesPreviewAssets(directory) {
  for (const entry of readdirSync(directory, { recursive: true })) {
    const file = basename(entry).toLowerCase();
    if (
      previewFiles.has(file) ||
      sourceExtensions.test(file) ||
      file.startsWith("agespreviewpanel-")
    ) {
      throw new Error(`AGES preview/source asset is outside the production contract: ${entry}`);
    }
  }
}
