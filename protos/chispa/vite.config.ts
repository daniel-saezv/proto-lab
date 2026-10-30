import { defineConfig } from "vite";

export default defineConfig({
  base: "/protos/chispa/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1300,
  },
});
