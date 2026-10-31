import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(root, "..", ".github", "scripts", "playwright-lockfile-version.test.sh");

describe("playwright-lockfile-version", () => {
  it("lee la versión fijada de @playwright/test en pnpm-lock.yaml", () => {
    const out = execFileSync("bash", [script], { encoding: "utf8" });
    expect(out).toContain("playwright-lockfile-version OK");
  });
});
