import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// base "./" + single-file output: dist/index.html opens straight from disk (file://), no server needed.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  css: { postcss: {} },                       // ignore stray PostCSS configs in parent folders
  build: { chunkSizeWarningLimit: 4000 },
});
