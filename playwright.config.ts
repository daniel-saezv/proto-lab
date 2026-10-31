import { defineConfig, devices } from "@playwright/test";

const ci = !!process.env.CI;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: ci ? 2 : undefined,
  retries: ci ? 1 : 0,
  reportSlowTests: { max: 5, threshold: 15_000 },
  reporter: ci ? [["list"], ["github"]] : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    locale: "es-ES",
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    command: "pnpm preview",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !ci,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
        },
      },
    },
    {
      name: "webkit-iphone",
      use: { ...devices["iPhone 13"] },
    },
  ],
});
