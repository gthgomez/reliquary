import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertNoAgesPreviewAssets } from "./scripts/ages-production-assets.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const browserTestBuild = process.env.VITE_RELIQUARY_BROWSER_TEST === "1";

/** Client-only Reliquary shell for static PWA hosting (no TanStack SSR). */
export default defineConfig(({ command, mode }) => {
  const agesPreview = browserTestBuild && mode === "ages-preview";
  if (command === "build") assertNoAgesPreviewAssets(resolve(root, "public"));
  return {
    define: {
      __RELIQUARY_BROWSER_TEST__: JSON.stringify(browserTestBuild),
      __RELIQUARY_AGES_PREVIEW__: JSON.stringify(agesPreview),
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
      alias: {
        "reliquary-economy-probes": resolve(
          root,
          browserTestBuild
            ? "src/game/shell/reliquary-economy-probes.ts"
            : "src/game/shell/reliquary-economy-probes.stub.ts",
        ),
        "reliquary-battle-browser-probes": resolve(
          root,
          browserTestBuild
            ? "src/game/ui/battle-browser-probes.ts"
            : "src/game/ui/battle-browser-probes.stub.ts",
        ),
      },
    },
    plugins: [tailwindcss(), viteReact()],
  };
});
