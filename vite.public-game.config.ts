import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertNoAgesPreviewAssets } from "./scripts/ages-production-assets.mjs";
import { validateElderhallPack } from "./scripts/elderhall-pack.mjs";
import { elderhallVisualGeometry } from "./scripts/elderhall-release.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const browserTestBuild = process.env.VITE_RELIQUARY_BROWSER_TEST === "1";

/** Client-only Reliquary shell for static PWA hosting (no TanStack SSR). */
export default defineConfig(({ command, mode }) => {
  const agesPreview = browserTestBuild && mode === "ages-preview";
  const candidate = process.env.VITE_ELDERHALL_CANDIDATE === "1";
  const geometry = candidate
    ? elderhallVisualGeometry(validateElderhallPack(resolve(root, "assets/elderhall-candidate")))
    : {};
  if (command === "build") assertNoAgesPreviewAssets(resolve(root, "public"));
  return {
    define: {
      __RELIQUARY_BROWSER_TEST__: JSON.stringify(browserTestBuild),
      __RELIQUARY_AGES_PREVIEW__: JSON.stringify(agesPreview),
      __PUBLIC_ELDERHALL_WORLD_REVISION__: JSON.stringify(candidate ? 5 : 2),
      __ELDERHALL_GEOMETRY__: JSON.stringify(geometry),
    },
    publicDir: "public",
    build: {
      outDir: agesPreview ? "dist/ages-preview" : ".vercel/output/static",
      // Both directories are complete generated builds. Clearing the previous
      // output keeps stale test chunks out of the production Workbox precache.
      emptyOutDir: true,
      minify: false,
      sourcemap: true,
      rollupOptions: {
        input: { index: "public-game.html" },
      },
    },
    resolve: {
      tsconfigPaths: true,
      alias: [
        ...(!candidate ? [
          { find: /^(?:\.\/|\.\.\/)render\/elderhall-visual\.ts$/, replacement: resolve(root, "src/game/render/elderhall-visual.stub.ts") },
          { find: /^\.\/elderhall-candidate\.ts$/, replacement: resolve(root, "src/game/maps/elderhall-candidate.stub.ts") },
        ] : []),
        { find: "reliquary-economy-probes", replacement: resolve(
          root,
          browserTestBuild
            ? "src/game/shell/reliquary-economy-probes.ts"
            : "src/game/shell/reliquary-economy-probes.stub.ts",
        ) },
        { find: "reliquary-battle-browser-probes", replacement: resolve(
          root,
          browserTestBuild
            ? "src/game/ui/battle-browser-probes.ts"
            : "src/game/ui/battle-browser-probes.stub.ts",
        ) },
      ],
    },
    plugins: [tailwindcss(), viteReact()],
  };
});
