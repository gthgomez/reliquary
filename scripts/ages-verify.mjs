import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const allowed = new Set(["typecheck", "validate:content", "build:web", "test", "elderhall-pack"]);
const check = process.argv[2];
if (!allowed.has(check) || process.argv.length !== 3) {
  console.error("Usage: node scripts/ages-verify.mjs {typecheck|validate:content|build:web|test|elderhall-pack}");
  process.exit(4);
}
if (Number(process.versions.node.split(".")[0]) < 24) {
  console.error("BLOCKED: Reliquary requires Node.js 24 or newer.");
  process.exit(3);
}
if (
  !["typescript", "vite", "zod"].every((name) =>
    existsSync(join(root, "node_modules", name, "package.json")),
  )
) {
  console.error("BLOCKED: Reliquary dependencies are missing. Run npm ci.");
  process.exit(3);
}

// Resolve npm's JavaScript entry point when adjacent to Node (the standard
// Windows layout). POSIX npm wrappers use the standard executable search.
const npmCli = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
const useNode = existsSync(npmCli);
const npmScript = check === "elderhall-pack"
  ? null
  : check;
const direct = check === "elderhall-pack"
  ? spawnSync(
      process.execPath,
      ["--test", join(root, "scripts/elderhall-pack.test.mjs")],
      { cwd: root, stdio: "inherit" },
    )
  : null;
const result = direct ?? spawnSync(
  useNode ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm",
  useNode ? [npmCli, "run", npmScript] : ["run", npmScript],
  { cwd: root, stdio: "inherit", shell: !useNode && process.platform === "win32" },
);
if (result.error || result.status === null) {
  console.error(
    `ERROR: Could not execute npm run ${check}: ${result.error?.message ?? result.signal}`,
  );
  process.exit(4);
}
process.exit(result.status === 0 ? 0 : 1);
