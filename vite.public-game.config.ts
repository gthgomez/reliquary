import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const browserTestBuild = process.env.VITE_RELIQUARY_BROWSER_TEST === "1";

/** Client-only Reliquary shell for static PWA hosting (no TanStack SSR). */
export default defineConfig({
  publicDir: "public",
  build: {
    outDir: ".vercel/output/static",
    emptyOutDir: false,
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
    },
  },
  plugins: [tailwindcss(), viteReact()],
});
