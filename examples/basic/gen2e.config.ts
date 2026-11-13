import { defineConfig } from "@rhighs/gen2e";

export default defineConfig({
  model: "gpt-4o-mini",
  vars: { first: "buy milk" },
  playwright: {
    use: { baseURL: "http://localhost:3000" },
    webServer: { command: "bun app.ts", url: "http://localhost:3000" },
  },
});
