import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { type Gen2EStepTelemetry, recordStepTelemetry } from "../../src/telemetry";

const makeRecord = (overrides: Partial<Gen2EStepTelemetry> = {}): Gen2EStepTelemetry => ({
  ts: "2026-10-02T00:00:00.000Z",
  testTitle: "title",
  task: "task",
  ident: "ident",
  cache: "miss",
  outcome: "success",
  attempts: 1,
  models: ["gpt-4o-mini"],
  toolCalls: 0,
  promptTokens: 1,
  completionTokens: 2,
  totalTokens: 3,
  wallClockMs: 4,
  screenshotPolicy: "model",
  promptVersion: "v1",
  ...overrides,
});

describe("recordStepTelemetry", () => {
  let basePath: string;
  let cwd: string;
  const originalTelemetry = process.env.GEN2E_TELEMETRY;
  const originalTelemetryPath = process.env.GEN2E_TELEMETRY_PATH;

  beforeEach(() => {
    basePath = mkdtempSync(path.join(tmpdir(), "gen2e-telemetry-unit-"));
    cwd = process.cwd();
    delete process.env.GEN2E_TELEMETRY;
    delete process.env.GEN2E_TELEMETRY_PATH;
  });

  afterEach(() => {
    process.chdir(cwd);
    if (originalTelemetry === undefined) {
      delete process.env.GEN2E_TELEMETRY;
    } else {
      process.env.GEN2E_TELEMETRY = originalTelemetry;
    }
    if (originalTelemetryPath === undefined) {
      delete process.env.GEN2E_TELEMETRY_PATH;
    } else {
      process.env.GEN2E_TELEMETRY_PATH = originalTelemetryPath;
    }
    rmSync(basePath, { recursive: true, force: true });
  });

  test("is disabled by default and writes nothing", () => {
    process.chdir(basePath);

    recordStepTelemetry(makeRecord());

    expect(existsSync(path.join(basePath, ".gen2e"))).toBe(false);
  });

  test("writes one JSON line per record to the default path when enabled", () => {
    process.chdir(basePath);
    process.env.GEN2E_TELEMETRY = "1";

    recordStepTelemetry(makeRecord({ ident: "one" }));
    recordStepTelemetry(makeRecord({ ident: "two" }));

    const lines = readFileSync(path.join(basePath, ".gen2e", "telemetry.jsonl"), "utf8")
      .trim()
      .split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).ident).toBe("one");
    expect(JSON.parse(lines[1]).ident).toBe("two");
  });

  test("honors GEN2E_TELEMETRY_PATH pointing at a file", () => {
    const file = path.join(basePath, "nested", "records.jsonl");
    process.env.GEN2E_TELEMETRY_PATH = file;

    recordStepTelemetry(makeRecord({ ident: "file" }));

    expect(JSON.parse(readFileSync(file, "utf8").trim()).ident).toBe("file");
  });

  test("appends the default file name when the path is a directory", () => {
    const dir = path.join(basePath, "telemetry-dir");
    mkdirSync(dir, { recursive: true });
    process.env.GEN2E_TELEMETRY_PATH = dir;

    recordStepTelemetry(makeRecord({ ident: "dir" }));

    const record = JSON.parse(readFileSync(path.join(dir, "telemetry.jsonl"), "utf8").trim());
    expect(record.ident).toBe("dir");
  });

  test("never throws on unwritable paths", () => {
    const blocker = path.join(basePath, "blocker");
    writeFileSync(blocker, "not a directory");
    process.env.GEN2E_TELEMETRY = "1";
    process.env.GEN2E_TELEMETRY_PATH = path.join(blocker, "telemetry.jsonl");

    expect(() => recordStepTelemetry(makeRecord())).not.toThrow();
  });
});
