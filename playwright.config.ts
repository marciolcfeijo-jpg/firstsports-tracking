import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";
const database =
  process.env.E2E_DATABASE_URL ||
  "postgresql://postgres@127.0.0.1:5432/firstsports_e2e_test?schema=public";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  globalSetup: "./tests/e2e/setup.ts",
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: [
    {
      command: "node tests/e2e/auth-fixture.mjs",
      port: 54321,
      reuseExistingServer: false,
    },
    {
      command: "npm run dev -- --port 3100",
      url: "http://localhost:3100",
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        DATABASE_URL: database,
        APP_URL: "http://localhost:3100",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-test-key",
        DOCUMENT_HMAC_KEY: "isolated-e2e-fixture-key-at-least-32-characters",
        CRON_SECRET: "isolated-e2e-cron-secret-at-least-32-characters",
      },
    },
  ],
});
