import { defineConfig } from "@playwright/test";

process.env.GEN2E_DBG = "1"

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: "http://127.0.0.1:9999",
    testIdAttribute: 'data-testid',
    trace: 'on-first-retry',
    ignoreHTTPSErrors: true,
    locale: 'it-IT',
    timezoneId: 'Europe/Rome'
  },
  webServer: {
    url: "http://127.0.0.1:9999",
    command: "npm run test-server",
    ignoreHTTPSErrors: true,
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe",
  },
});