import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["functions/**/*.test.ts", "scripts/**/*.test.mjs", "apps/world/src/**/*.test.ts"],
  },
});
