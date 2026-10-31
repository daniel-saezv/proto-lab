import { defineConfig } from "vite";

export default defineConfig({
  base: "/protos/asset-lab/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
