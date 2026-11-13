import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { estimateCostUsd } from "../../src/pricing";

describe("estimateCostUsd", () => {
  let basePath: string;
  const originalPricingFile = process.env.GEN2E_PRICING_FILE;

  beforeEach(() => {
    basePath = mkdtempSync(path.join(tmpdir(), "gen2e-pricing-"));
    delete process.env.GEN2E_PRICING_FILE;
  });

  afterEach(() => {
    if (originalPricingFile === undefined) {
      delete process.env.GEN2E_PRICING_FILE;
    } else {
      process.env.GEN2E_PRICING_FILE = originalPricingFile;
    }
    rmSync(basePath, { recursive: true, force: true });
  });

  test("prices known models from the built-in map", () => {
    expect(
      estimateCostUsd("gpt-4o-mini", { promptTokens: 1_000_000, completionTokens: 1_000_000 }),
    ).toBeCloseTo(0.75);
    expect(
      estimateCostUsd("GPT-4O-MINI", { promptTokens: 1_000_000, completionTokens: 0 }),
    ).toBeCloseTo(0.15);
    expect(
      estimateCostUsd("claude-sonnet-4.6", { promptTokens: 0, completionTokens: 1_000_000 }),
    ).toBeGreaterThan(0);
    expect(
      estimateCostUsd("gemini-3.8-flash", { promptTokens: 1_000_000, completionTokens: 0 }),
    ).toBeGreaterThan(0);
  });

  test("returns undefined for unknown models", () => {
    expect(
      estimateCostUsd("unknown-model", { promptTokens: 10, completionTokens: 10 }),
    ).toBeUndefined();
  });

  test("ignores a malformed override file", () => {
    const file = path.join(basePath, "pricing.json");
    writeFileSync(file, "{not json");
    process.env.GEN2E_PRICING_FILE = file;

    expect(
      estimateCostUsd("gpt-4o-mini", { promptTokens: 1_000_000, completionTokens: 0 }),
    ).toBeCloseTo(0.15);
    expect(
      estimateCostUsd("unknown-model", { promptTokens: 1, completionTokens: 1 }),
    ).toBeUndefined();
  });

  test("augments and overrides entries from the override file", () => {
    const file = path.join(basePath, "pricing.json");
    writeFileSync(
      file,
      JSON.stringify({
        "custom-model": { prompt: 1, completion: 2 },
        "gpt-4o-mini": { prompt: 10, completion: 0 },
        "bad-model": { prompt: "not-a-number", completion: 1 },
      }),
    );
    process.env.GEN2E_PRICING_FILE = file;

    expect(
      estimateCostUsd("custom-model", { promptTokens: 1_000_000, completionTokens: 1_000_000 }),
    ).toBeCloseTo(3);
    expect(
      estimateCostUsd("gpt-4o-mini", { promptTokens: 1_000_000, completionTokens: 0 }),
    ).toBeCloseTo(10);
    expect(estimateCostUsd("bad-model", { promptTokens: 1, completionTokens: 1 })).toBeUndefined();
  });
});
