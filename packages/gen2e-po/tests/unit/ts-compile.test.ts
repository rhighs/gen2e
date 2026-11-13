import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getDiagnostics } from "../../src/ts-compile";

describe("getDiagnostics", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "gen2e-po-tsc-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("reports a type error with its file, line and message", () => {
    const file = path.join(dir, "page.ts");
    writeFileSync(file, 'const ok = 1;\nconst n: number = "not a number";\n');

    const diags = getDiagnostics([file], { strict: true, types: [] });

    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({ filename: file, line: 2, char: 7 });
    expect(diags[0]?.message).toContain("not assignable to type 'number'");
  }, 30_000);

  test("returns nothing for a clean file", () => {
    const file = path.join(dir, "clean.ts");
    writeFileSync(file, "export const n: number = 1;\n");

    expect(getDiagnostics([file], { strict: true, types: [] })).toEqual([]);
  }, 30_000);
});
