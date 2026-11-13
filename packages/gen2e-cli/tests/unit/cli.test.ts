import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import path from "node:path";

const bin = path.resolve(import.meta.dir, "../../src/index.ts");

const run = (...args: string[]) => spawnSync("bun", [bin, ...args], { encoding: "utf8" });

describe("gen2e-cli", () => {
  test.each(["generate", "recorder"])("%s --help exits 0", (cmd) => {
    const res = run(cmd, "--help");

    expect(res.stderr).toBe("");
    expect(res.status).toBe(0);
    expect(res.stdout).toContain(`Usage: gen2e-cli ${cmd}`);
  });

  test("lists every command", () => {
    const res = run("--help");

    expect(res.status).toBe(0);
    for (const cmd of ["generate", "recorder"]) {
      expect(res.stdout).toContain(cmd);
    }
  });
});
