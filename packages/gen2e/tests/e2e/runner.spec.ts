import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";

const cwd = path.join(import.meta.dirname, "..", "runner");
const cli = path.join(import.meta.dirname, "..", "..", "src", "cli.ts");

const gen2e = (args: string[], env: Record<string, string> = {}) => {
  const res = Bun.spawnSync([process.execPath, cli, ...args], {
    cwd,
    env: { ...process.env, GEN2E_DBG: "0", ...env },
  });
  return { code: res.exitCode, out: `${res.stdout}${res.stderr}` };
};

let dir: string;

test.beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "gen2e-runner-"));
});

test.afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

test("runs .gen2e files and specs, then replays them from the cache", async () => {
  test.setTimeout(120_000);
  const env = { GEN2E_STATIC_PATH: dir };

  const first = gen2e(["--var", "query=dogs"], env);
  expect(first.out).toContain("2 passed");
  expect(first.code).toBe(0);

  const replay = gen2e(["run", ".", "--var=query=dogs"], { ...env, GEN2E_REPLAY_ONLY: "1" });
  expect(replay.out).toContain("2 passed");
  expect(replay.code).toBe(0);

  const ejected = gen2e(["eject", "search.gen2e", "--out", dir], env);
  expect(ejected.code).toBe(0);
  const spec = readFileSync(path.join(dir, "search.spec.ts"), "utf8");
  expect(spec).toContain("await page.goto(`/`);");
  expect(spec).toContain("fill(vars.query)");
  expect(spec).toContain('expect(await test.step("assert the click count is 1"');
  expect(() => new Bun.Transpiler({ loader: "ts" }).transformSync(spec)).not.toThrow();
});

test("fails when a step has no cached code in replay-only mode", async () => {
  test.setTimeout(120_000);

  const res = gen2e(["search.gen2e"], { GEN2E_STATIC_PATH: dir, GEN2E_REPLAY_ONLY: "1" });

  expect(res.out).toContain("1 failed");
  expect(res.code).toBe(1);
  expect(gen2e(["eject"], { GEN2E_STATIC_PATH: dir }).code).toBe(1);
});
