import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  // A known flake in e2e/quickbar.spec.ts (arrow-binding persistence) shows up
  // under parallel load in CI. One retry lets CI recover from it without
  // masking real failures locally, where the first attempt still fails honestly.
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: "http://localhost:5173", trace: "on-first-retry" },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
