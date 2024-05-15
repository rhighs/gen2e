import { defineConfig } from "@playwright/test";

export default defineConfig({
  use: {
    baseURL: "https://prolocal.mywellness.com:12443",
    testIdAttribute: 'data-testid',
    trace: 'on-first-retry',
    ignoreHTTPSErrors: true,
    locale: 'it-IT',
    timezoneId: 'Europe/Rome'
  },
  // webServer: {
  //   command: "npm run start",
  //   url: "http://127.0.0.1:3000",
  //   reuseExistingServer: !process.env.CI,
  //   stdout: "ignore",
  //   stderr: "pipe",
  // },
});
