import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadConfig } from "../../src/config";

describe("loadConfig", () => {
  const cwd = process.cwd();
  let dir: string;

  const writeConfig = (body: string) => {
    writeFileSync(path.join(dir, "gen2e.config.cjs"), body);
  };

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "gen2e-config-"));
    process.chdir(dir);
  });

  afterEach(() => {
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns undefined when there is no config file", () => {
    expect(loadConfig()).toBeUndefined();
  });

  test("reads typed values and the policies block", () => {
    writeConfig(`exports.default = {
      model: "gpt-4o-mini",
      ladder: true,
      policies: { maxRetries: 2, screenshot: "off", visualDebugLevel: "high" },
    };`);

    expect(loadConfig()).toMatchObject({
      model: "gpt-4o-mini",
      ladder: true,
      policies: { maxRetries: 2, screenshot: "off", visualDebugLevel: "high" },
    });
  });

  test("drops values of the wrong type or outside the allowed set", () => {
    writeConfig(`exports.default = {
      model: 42,
      debug: "yes",
      maxRetries: 9,
      policies: { maxRetries: "3", screenshot: "always", visualDebugLevel: "loud" },
    };`);

    const cfg = loadConfig();

    expect(cfg?.model).toBeUndefined();
    expect(cfg?.debug).toBeUndefined();
    expect(cfg?.policies).toEqual({
      maxRetries: undefined,
      screenshot: undefined,
      visualDebugLevel: undefined,
    });
  });

  test("accepts an AI SDK model instance", () => {
    writeConfig(
      'exports.default = { model: { specificationVersion: "v4", provider: "p", modelId: "m" } };',
    );

    expect(loadConfig()?.model).toMatchObject({ provider: "p", modelId: "m" });
  });

  test("reads the runner fields", () => {
    writeConfig(`exports.default = {
      tests: ["e2e/**/*.gen2e"],
      vars: { user: "ada" },
      playwright: { use: { baseURL: "http://localhost:3000" } },
    };`);

    expect(loadConfig()).toMatchObject({
      tests: ["e2e/**/*.gen2e"],
      vars: { user: "ada" },
      playwright: { use: { baseURL: "http://localhost:3000" } },
    });
  });

  test("throws when the config file does not load", () => {
    writeConfig("exports.default = {");

    expect(() => loadConfig()).toThrow();
  });

  test("treats a module without a default export as an empty config", () => {
    writeConfig("module.exports = { model: 'gpt-4o-mini' };");

    expect(loadConfig()?.model).toBeUndefined();
  });
});
