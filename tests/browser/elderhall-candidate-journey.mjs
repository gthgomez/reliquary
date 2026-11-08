/** Run the natural starter-to-road journey against the built candidate. */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer } from "./helpers.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const output = join(root, "qa-evidence", "elderhall-candidate-journey");
mkdirSync(output, { recursive: true });
const { server, baseUrl } = await startStaticServer(0);
try {
  const status = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(root, "scripts/natural-journey-qa.mjs"), baseUrl, output], {
      cwd: root, stdio: "inherit", env: { ...process.env, VITE_ELDERHALL_CANDIDATE: "1" },
    });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code));
  });
  if (status !== 0) process.exitCode = 1;
} finally {
  await new Promise((resolve) => server.close(resolve));
}
