import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

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
  resolve: { tsconfigPaths: true },
  plugins: [tailwindcss(), viteReact()],
});
