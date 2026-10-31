import { cpSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";

function copyPreview(): Plugin {
  return {
    name: "copy-preview",
    closeBundle() {
      const manifest = JSON.parse(readFileSync("proto.json", "utf8")) as { preview?: string };
      if (!manifest.preview || !existsSync(manifest.preview)) return;
      cpSync(manifest.preview, join("dist", manifest.preview));
    },
  };
}

export default defineConfig({
  base: "/protos/chispa/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1300,
  },
  plugins: [copyPreview()],
});
