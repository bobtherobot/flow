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
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // Firefox runs one spec, not the suite. The panel number field's spin
    // buttons are browser-native chrome and the engines genuinely differ — the
    // first version of that feature worked in Chromium and did nothing at all
    // in Firefox, because Firefox reports a spin step as an InputEvent that
    // looks exactly like typing. jsdom cannot catch that class of bug (it
    // renders no spin buttons), and running the whole suite on a second engine
    // would cost far more than the one place where the difference bites.
    {
      name: "firefox-number-field",
      testMatch: /number-field\.spec\.ts/,
      use: { ...devices["Desktop Firefox"] },
    },
  ],
});
