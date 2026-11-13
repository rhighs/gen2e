import path from "node:path";
import { defineConfig } from "@playwright/test";
import { config } from "../config";
import { readPlan } from "./plan";

const root = process.cwd();
const plan = readPlan();
const pw = config().playwright ?? {};
const exact = (f: string) => new RegExp(`^${f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
const servers = pw.webServer ? [pw.webServer].flat() : [];

// This file lives inside the package, so every path Playwright would resolve against it is pinned to the project root.
export default defineConfig({
  ...pw,
  testDir: root,
  outputDir: path.resolve(root, pw.outputDir ?? "test-results"),
  webServer: servers.map((s) => ({ ...s, cwd: path.resolve(root, s.cwd ?? ".") })),
  projects: [
    ...(plan.plain.length
      ? [{ name: "gen2e", testDir: import.meta.dirname, testMatch: "plain-tests.ts" }]
      : []),
    ...(plan.specs.length ? [{ name: "specs", testMatch: plan.specs.map(exact) }] : []),
  ],
});
