#!/usr/bin/env bun
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { chromium } from "@playwright/test";
import type { StaticGenStep } from "@rhighs/gen2e-core";
import { FSStaticStore } from "@rhighs/gen2e-store";
import cfg from "./config";
import { bindAI } from "./gen";
import { type PlainStep, parsePlain, plainTitle, runPlainStep, stepTask } from "./runner/plain";
import { PLAN_ENV, type RunPlan } from "./runner/plan";
import type { Gen2EVars } from "./types";

const HELP = `Usage:
  gen2e [run] [paths...] [--var name=value] [playwright flags]
  gen2e record <file.gen2e> [--url <url>]
  gen2e eject [paths...] [--out <dir>]

run     runs every test under the current directory, or under the given paths
record  opens a browser, runs each line you type, and appends the ones that pass
eject   writes a plain Playwright spec next to each .gen2e file, from its cached steps

Tests are *.gen2e files (one English step per line) and *.gen2e.ts specs. Set
\`tests\` in gen2e.config.ts to change the globs. Playwright flags pass through;
write them as --flag=value.`;

const DEFAULT_TESTS = ["**/*.gen2e", "**/*.gen2e.ts"];

const PW_VALUE_FLAGS = new Set([
  "-g",
  "--grep",
  "--grep-invert",
  "-j",
  "--workers",
  "--reporter",
  "--retries",
  "--repeat-each",
  "--timeout",
  "--max-failures",
  "--shard",
  "--trace",
]);

type Args = { paths: string[]; flags: Record<string, string[]>; rest: string[] };

const parseArgs = (argv: string[], own: string[]): Args => {
  const args: Args = { paths: [], flags: {}, rest: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a === "--") {
      args.rest.push(...argv.slice(i + 1));
      break;
    }
    const [name, inline] = a.split(/=(.*)/s, 2) as [string, string | undefined];
    if (own.includes(name)) {
      const val = inline ?? argv[++i];
      if (val === undefined) {
        fail(`${name} needs a value`);
      }
      args.flags[name] = [...(args.flags[name] ?? []), val];
    } else if (a.startsWith("-")) {
      args.rest.push(a);
      if (inline === undefined && PW_VALUE_FLAGS.has(a) && argv[i + 1] !== undefined) {
        args.rest.push(argv[++i] as string);
      }
    } else {
      args.paths.push(path.resolve(a));
    }
  }
  return args;
};

function fail(msg: string): never {
  console.error(`gen2e: ${msg}`);
  process.exit(1);
}

const isPlain = (f: string) => f.endsWith(".gen2e");

const discover = (paths: string[]): RunPlan => {
  const root = process.cwd();
  const found = new Set<string>();
  for (const pattern of cfg.tests ?? DEFAULT_TESTS) {
    for (const f of new Bun.Glob(pattern).scanSync({ cwd: root, absolute: true })) {
      if (!f.split(path.sep).includes("node_modules")) {
        found.add(f);
      }
    }
  }

  let files = [...found];
  if (paths.length) {
    files = paths.flatMap((p) => {
      if (!existsSync(p)) {
        fail(`no such file or directory: ${path.relative(root, p)}`);
      }
      return statSync(p).isDirectory() ? files.filter((f) => f.startsWith(p + path.sep)) : [p];
    });
  }

  const sorted = [...new Set(files)].sort();
  return { plain: sorted.filter(isPlain), specs: sorted.filter((f) => !isPlain(f)) };
};

const playwrightCli = () => Bun.resolveSync("@playwright/test/cli", import.meta.dir);

const ensureChromium = () => {
  if (existsSync(chromium.executablePath())) {
    return;
  }
  console.error("gen2e: installing Chromium");
  const res = Bun.spawnSync([process.execPath, playwrightCli(), "install", "chromium"], {
    stdio: ["inherit", "inherit", "inherit"],
  });
  if (res.exitCode !== 0) {
    fail("could not install Chromium");
  }
};

const parseVars = (pairs: string[] = []): Gen2EVars =>
  Object.fromEntries(
    pairs.map((p) => {
      const idx = p.indexOf("=");
      if (idx < 1) {
        fail(`--var expects name=value, got ${p}`);
      }
      return [p.slice(0, idx), p.slice(idx + 1)];
    }),
  );

const run = (argv: string[]) => {
  const args = parseArgs(argv, ["--var"]);
  const plan = discover(args.paths);
  if (!plan.plain.length && !plan.specs.length) {
    fail(`no tests found (looked for ${(cfg.tests ?? DEFAULT_TESTS).join(", ")})`);
  }

  ensureChromium();

  const vars: Gen2EVars = {
    ...JSON.parse(process.env.GEN2E_VARS ?? "{}"),
    ...parseVars(args.flags["--var"]),
  };
  const config = path.join(import.meta.dir, "runner", "playwright.config.ts");
  const res = Bun.spawnSync(
    [process.execPath, "--bun", playwrightCli(), "test", "-c", config, ...args.rest],
    {
      stdio: ["inherit", "inherit", "inherit"],
      env: { ...process.env, [PLAN_ENV]: JSON.stringify(plan), GEN2E_VARS: JSON.stringify(vars) },
    },
  );
  process.exit(res.exitCode ?? 1);
};

const record = async (argv: string[]) => {
  const args = parseArgs(argv, ["--url"]);
  const file = args.paths[0];
  if (!file || !isPlain(file)) {
    fail("record needs a .gen2e file");
  }

  ensureChromium();

  const title = plainTitle(file);
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ baseURL: cfg.playwright?.use?.baseURL });
  const ai = bindAI(page, { title });

  const runStep = async (step: PlainStep): Promise<boolean> => {
    console.log(`> ${step.text}`);
    try {
      await runPlainStep(step, page, ai, cfg.vars);
      return true;
    } catch (err) {
      console.error(`  failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  };

  const append = (text: string) => {
    const cur = existsSync(file) ? readFileSync(file, "utf8").trimEnd() : "";
    writeFileSync(file, `${cur ? `${cur}\n` : ""}${text}\n`);
  };

  for (const step of existsSync(file) ? parsePlain(readFileSync(file, "utf8")) : []) {
    if (!(await runStep(step))) {
      await browser.close();
      fail(`${path.relative(process.cwd(), file)}:${step.line} failed; fix it first`);
    }
  }

  const url = args.flags["--url"]?.[0];
  if (url) {
    const [step] = parsePlain(`open ${url}`);
    if (step && (await runStep(step))) {
      append(step.text);
    }
  }

  console.log("Type a step and press enter. An empty line or Ctrl+D stops.");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  for (;;) {
    const text = (await rl.question("> ").catch(() => "")).trim();
    if (!text) {
      break;
    }
    const [step] = parsePlain(text);
    if (step && (await runStep(step))) {
      append(step.text);
    }
  }
  rl.close();
  await browser.close();
};

const latestByStep = (): Map<string, StaticGenStep> => {
  const byStep = new Map<string, StaticGenStep>();
  for (const { content } of FSStaticStore.exportEntries()) {
    const k = `${content.context?.testTitle}\0${content.context?.task}`;
    const prev = byStep.get(k);
    if (!prev || (content.meta?.generatedAt ?? "") > (prev.meta?.generatedAt ?? "")) {
      byStep.set(k, content);
    }
  }
  return byStep;
};

const templateOf = (s: string) => {
  const escaped = s.replace(/[`\\]|\$\{/g, (m) => `\\${m}`);
  return `\`${escaped.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => `\${vars.${k}}`)}\``;
};

const eject = (argv: string[]) => {
  const args = parseArgs(argv, ["--out"]);
  const out = args.flags["--out"]?.[0];
  const files = discover(args.paths).plain;
  if (!files.length) {
    fail("no .gen2e files found");
  }

  const cached = latestByStep();
  let missing = 0;
  for (const file of files) {
    const title = plainTitle(file);
    const steps = parsePlain(readFileSync(file, "utf8"));
    const body: string[] = [];
    let complete = true;
    for (const step of steps) {
      if (step.kind === "open") {
        body.push(`  await page.goto(${templateOf(step.arg)});`);
        continue;
      }
      const expression = cached.get(`${title}\0${stepTask(step)}`)?.expression;
      if (!expression) {
        console.error(
          `${path.relative(process.cwd(), file)}:${step.line}: no cached code for "${step.text}"`,
        );
        missing++;
        complete = false;
        continue;
      }
      const call = `await test.step(${JSON.stringify(step.text)}, ${expression})`;
      body.push(step.kind === "assert" ? `  expect(${call}).toBe(true);` : `  ${call};`);
    }

    if (!complete) {
      continue;
    }

    const usesVars = steps.some((s) => /\{\{\s*\w+\s*\}\}/.test(s.text));
    const dst = path.join(
      out ? path.resolve(out) : path.dirname(file),
      `${path.basename(file, ".gen2e")}.spec.ts`,
    );
    writeFileSync(
      dst,
      [
        `import { expect, test } from "@playwright/test";`,
        "",
        ...(usesVars
          ? [`const vars: Record<string, string> = JSON.parse(process.env.GEN2E_VARS ?? "{}");`, ""]
          : []),
        `test(${JSON.stringify(title)}, async ({ page }) => {`,
        ...body,
        "});",
        "",
      ].join("\n"),
    );
    console.log(`${path.relative(process.cwd(), file)} -> ${path.relative(process.cwd(), dst)}`);
  }

  if (missing) {
    fail(`${missing} step(s) have no cached code; run \`gen2e run\` first`);
  }
};

const [cmd, ...argv] = process.argv.slice(2);

if (cmd === "-h" || cmd === "--help" || cmd === "help") {
  console.log(HELP);
} else if (cmd === "record") {
  await record(argv);
} else if (cmd === "eject") {
  eject(argv);
} else {
  run(cmd === "run" ? argv : process.argv.slice(2));
}
