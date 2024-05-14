import { defineConfig } from "@playwright/test";

process.env.AUTO_PLAYWRIGHT_DEBUG = 'true'

export default defineConfig({
  webServer: {
    command: "npm run start",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe",
  },
  use: {
    baseURL: "http://127.0.0.1:3000",
  },
});
