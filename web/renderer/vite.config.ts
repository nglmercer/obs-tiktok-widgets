import { defineConfig } from "vite";
import { resolve } from "node:path";
export default defineConfig({
  build: {
    outDir: resolve("data/web/renderer"),
    emptyOutDir: true,
    target: "chrome100",
    lib: {
      entry: resolve("web/renderer/main.js"),
      name: "TikTokCompositor",
      formats: ["iife"],
      fileName: () => "renderer.js",
    },
  },
});
