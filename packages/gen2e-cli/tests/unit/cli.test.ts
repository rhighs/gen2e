import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import path from "node:path";

const bin = path.resolve(__dirname, "../../bin/gen2e-cli.js");

const run = (...args: string[]) => spawnSync("node", [bin, ...args], { encoding: "utf8" });

describe("gen2e-cli under node", () => {
  test.each(["generate", "recorder", "repl", "po-gen"])("%s --help exits 0", (cmd) => {
    const res = run(cmd, "--help");

    expect(res.stderr).toBe("");
    expect(res.status).toBe(0);
    expect(res.stdout).toContain(`Usage: gen2e-cli ${cmd}`);
  });

  test("lists every command", () => {
    const res = run("--help");

    expect(res.status).toBe(0);
    for (const cmd of ["generate", "recorder", "repl", "po-gen"]) {
      expect(res.stdout).toContain(cmd);
    }
  });
});
