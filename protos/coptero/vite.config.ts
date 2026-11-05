import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const manifest = JSON.parse(readFileSync(new URL("./proto.json", import.meta.url), "utf8")) as { slug: string };

export default defineConfig({
  base: `/protos/${manifest.slug}/`,
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
