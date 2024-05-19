import { defineConfig } from "@playwright/test";

export default defineConfig({
  webServer: {
    url: "http://127.0.0.1:9999",
    command: "npm run test-server",
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe",
  },
});