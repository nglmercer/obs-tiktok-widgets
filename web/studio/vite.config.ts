import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
export default defineConfig({
  root: "web/studio",
  base: "./",
  plugins: [tailwindcss()],
  esbuild: { jsx: "automatic" },
  build: {
    outDir: resolve("data/web/studio"),
    emptyOutDir: true,
    target: "chrome100",
  },
});
