import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");

function testFiles(directory) {
  const out = [];
  for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) out.push(...testFiles(path));
    else if (/\.test\.(?:mjs|ts)$/.test(entry.name)) out.push(path);
  }
  return out;
}

const args = new Set(process.argv.slice(2));
const files = args.has("--all")
  ? ["scripts", "src"].flatMap(testFiles)
  : [
      "src/game",
      "src/lib/app-data/app-data.test.ts",
      "src/lib/auth/gate-identity.test.ts",
      "src/lib/auth/preview.test.ts",
    ]
    .flatMap((path) => path.endsWith(".test.ts") ? [path] : testFiles(path));
const testArgs = files.map((path) => relative(root, join(root, path)));
const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", ...testArgs], {
  cwd: root,
  stdio: "inherit",
});
if (result.error) {
  console.error(`[tests] failed to start: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
