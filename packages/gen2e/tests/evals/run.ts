/**
 * Nightly evaluation harness for the gen2e library.
 *
 * Model mode pins a model through `GEN2E_EVAL_MODEL`, generates every corpus
 * task against the local fixture app and reports pass@1, success within k
 * attempts, attempts, retries, tool calls, tokens, cost and wall-clock.
 *
 * Replay mode never calls a model and never writes expressions: it serves the
 * corpus from the static store, counts hits and misses and quarantines entries
 * whose cached expression fails at evaluation time.
 *
 * Run from the repository root:
 *   npm run eval            # model mode
 *   npm run eval:replay     # replay mode
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type Browser, chromium, type Page } from "@playwright/test";
import {
  FSStaticStore,
  Gen2ECacheMissError,
  type Gen2EScreenshotUsagePolicy,
  Gen2EStaleCacheError,
  type Gen2EStepTelemetry,
  gen,
} from "../../src";
import env from "../../src/env";

export type EvalMode = "model" | "replay";
export type EvalTaskKind = "query" | "action" | "assertion" | "multi-step";

export type EvalExpectation =
  | { type: "equals"; value: string | number | boolean }
  | { type: "truthy" }
  | { type: "falsy" }
  | { type: "contains"; value: string };

export type EvalVerification = {
  locator: string;
  text?: string;
  inputValue?: string;
  contains?: string;
};

export type EvalCorpusTask = {
  id: string;
  title: string;
  kind: EvalTaskKind;
  url: string;
  task: string;
  expect?: EvalExpectation;
  verify?: EvalVerification;
};

export type EvalCorpus = {
  version: number;
  tasks: EvalCorpusTask[];
};

export type EvalRunOptions = {
  mode?: EvalMode;
  /** Pinned model id. Defaults to `GEN2E_EVAL_MODEL`. */
  model?: string;
  /** Repetitions per task. Defaults to `EVAL_RUNS` (1). */
  runs?: number;
  /** Minimum per-task pass@1 in model mode. Defaults to `EVAL_MIN_PASS` (0). */
  minPass?: number;
  /** Attempts per generation, i.e. k in success-within-k. Defaults to `EVAL_MAX_ATTEMPTS` (3). */
  maxAttempts?: number;
  /** Screenshot policy for eval runs. Defaults to `EVAL_SCREENSHOT` ("off"). */
  screenshot?: Gen2EScreenshotUsagePolicy;
  /** Cache base directory. Defaults to `EVAL_STATIC_PATH` or a run-scoped path. */
  staticPath?: string;
  /** Report path. Defaults to `EVAL_REPORT` ("eval-report.json"). */
  reportPath?: string;
  /** Telemetry JSONL path. Defaults to `EVAL_TELEMETRY_PATH` or `<runDir>/telemetry.jsonl`. */
  telemetryPath?: string;
  /** Corpus path. Defaults to `tests/evals/corpus.json` next to this file. */
  corpusPath?: string;
  /** Fixture server port. Defaults to the fixture's own 9999. */
  port?: number;
  /** When false, assumes the fixture app is already reachable and never spawns it. */
  manageServer?: boolean;
};

export type EvalTaskReport = {
  id: string;
  title: string;
  kind: EvalTaskKind;
  task: string;
  runs: number;
  passed: number;
  failed: number;
  passAt1: number;
  successWithinK: number;
  attempts: number;
  retries: number;
  toolCalls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd?: number;
  wallClockMs: number;
  cacheHits: number;
  cacheMisses: number;
  quarantined: number;
  hardErrors: number;
  errors: string[];
};

export type EvalSummary = {
  tasks: number;
  passedTasks: number;
  passAt1: number;
  successWithinK: number;
  cacheHits: number;
  cacheMisses: number;
  quarantined: number;
  hardErrors: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd?: number;
  wallClockMs: number;
  minPass: number;
  exitCode: number;
};

export type EvalReport = {
  mode: EvalMode;
  runId: string;
  model: string;
  runs: number;
  maxAttempts: number;
  screenshot: string;
  baseUrl: string;
  staticPaths: string[];
  telemetryPath: string;
  reportPath: string;
  startedAt: string;
  finishedAt: string;
  tasks: EvalTaskReport[];
  summary: EvalSummary;
};

type TaskExecution = {
  status: "passed" | "failed" | "miss" | "quarantined" | "hard-error";
  attempts: number;
  retries: number;
  toolCalls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd?: number;
  wallClockMs: number;
  cache: Gen2EStepTelemetry["cache"];
  detail?: string;
};

type FixtureServer = {
  baseUrl: string;
  stop: () => void;
};

const FIXTURE_PORT = 9999;
const DEFAULT_CORPUS = path.resolve(__dirname, "corpus.json");
const PACKAGE_DIR = path.resolve(__dirname, "..", "..");
const SERVER_SCRIPT = path.resolve(__dirname, "..", "bin", "start-test-server.ts");
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const TASK_KINDS = new Set<string>(["query", "action", "assertion", "multi-step"]);
const SCREENSHOT_POLICIES: Gen2EScreenshotUsagePolicy[] = ["force", "model", "onfail", "off"];

const USAGE = `gen2e eval harness

Usage:
  npm run eval [-- <flags>]          model mode (requires GEN2E_EVAL_MODEL and OPENAI_API_KEY)
  npm run eval:replay [-- <flags>]   replay mode (no API key, never generates)

Flags:
  --replay                run in replay mode
  --model <id>            pinned model id (default: GEN2E_EVAL_MODEL)
  --runs <n>              repetitions per task (default: EVAL_RUNS=1)
  --min-pass <0..1>       minimum per-task pass@1 in model mode (default: EVAL_MIN_PASS=0)
  --max-attempts <n>      attempts per generation (default: EVAL_MAX_ATTEMPTS=3)
  --static-path <dir>     cache directory (default: EVAL_STATIC_PATH or run-scoped)
  --report <file>         report path (default: EVAL_REPORT=eval-report.json)
  --telemetry <file>      telemetry JSONL path (default: EVAL_TELEMETRY_PATH or run-scoped)
  --corpus <file>         corpus path (default: tests/evals/corpus.json)
  --help                  show this message

Endpoint:
  OPENAI_API_KEY           required in model mode
  OPENAI_BASE_URL          optional OpenAI-compatible base URL
`;

const messageOf = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === "string" ? error : JSON.stringify(error);
};

const envNumber = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const fixtureUrl = (port: number): string => `http://127.0.0.1:${port}`;

const requireString = (value: unknown, field: string, where: string): string => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`corpus ${where}: "${field}" must be a non-empty string`);
  }
  return value;
};

const parseExpectation = (value: unknown, where: string): EvalExpectation => {
  if (!value || typeof value !== "object") {
    throw new Error(`corpus ${where}: "expect" must be an object`);
  }
  const record = value as Record<string, unknown>;
  if (record.type === "truthy" || record.type === "falsy") {
    return { type: record.type };
  }
  if (record.type === "equals") {
    const expected = record.value;
    if (
      typeof expected !== "string" &&
      typeof expected !== "number" &&
      typeof expected !== "boolean"
    ) {
      throw new Error(`corpus ${where}: "equals" needs a string, number or boolean "value"`);
    }
    return { type: "equals", value: expected };
  }
  if (record.type === "contains") {
    return { type: "contains", value: requireString(record.value, "expect.value", where) };
  }
  throw new Error(`corpus ${where}: unsupported expect type ${JSON.stringify(record.type)}`);
};

const parseVerification = (value: unknown, where: string): EvalVerification => {
  if (!value || typeof value !== "object") {
    throw new Error(`corpus ${where}: "verify" must be an object`);
  }
  const record = value as Record<string, unknown>;
  const locator = requireString(record.locator, "verify.locator", where);
  const provided = [record.text, record.inputValue, record.contains].filter(
    (entry) => entry !== undefined,
  );
  if (provided.length !== 1) {
    throw new Error(
      `corpus ${where}: "verify" needs exactly one of "text", "inputValue" or "contains"`,
    );
  }
  const verification: EvalVerification = { locator };
  if (typeof record.text === "string") {
    verification.text = record.text;
  }
  if (typeof record.inputValue === "string") {
    verification.inputValue = record.inputValue;
  }
  if (typeof record.contains === "string") {
    verification.contains = record.contains;
  }
  return verification;
};

/**
 * Loads and validates the corpus. Fails loudly on malformed tasks so a broken
 * corpus never produces a misleading report.
 */
export const loadCorpus = (corpusPath: string): EvalCorpus => {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(corpusPath, "utf8"));
  } catch (error) {
    throw new Error(`failed to read eval corpus at ${corpusPath}: ${messageOf(error)}`);
  }
  if (!raw || typeof raw !== "object") {
    throw new Error(`corpus ${corpusPath} must be a JSON object`);
  }

  const { version, tasks } = raw as { version?: unknown; tasks?: unknown };
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error(`corpus ${corpusPath} must define a non-empty "tasks" array`);
  }

  const ids = new Set<string>();
  const parsed = tasks.map((entry, index): EvalCorpusTask => {
    const where = `task[${index}]`;
    if (!entry || typeof entry !== "object") {
      throw new Error(`corpus ${where} must be an object`);
    }
    const record = entry as Record<string, unknown>;
    const id = requireString(record.id, "id", where);
    if (ids.has(id)) {
      throw new Error(`corpus ${where}: duplicate id "${id}"`);
    }
    ids.add(id);

    const kind = requireString(record.kind, "kind", where);
    if (!TASK_KINDS.has(kind)) {
      throw new Error(`corpus ${where}: unknown kind "${kind}"`);
    }

    if (record.expect === undefined && record.verify === undefined) {
      throw new Error(`corpus ${where}: needs an "expect" or a "verify" check`);
    }

    return {
      id,
      title: requireString(record.title, "title", where),
      kind: kind as EvalTaskKind,
      url: requireString(record.url, "url", where),
      task: requireString(record.task, "task", where),
      ...(record.expect !== undefined ? { expect: parseExpectation(record.expect, where) } : {}),
      ...(record.verify !== undefined ? { verify: parseVerification(record.verify, where) } : {}),
    };
  });

  return { version: typeof version === "number" ? version : 1, tasks: parsed };
};

/**
 * Compares a generation result against a corpus expectation. Numbers and
 * booleans are compared through their string form so model output that is
 * semantically equal but differently typed still passes.
 */
export const checkExpectation = (
  expectation: EvalExpectation,
  actual: unknown,
): { ok: boolean; detail: string } => {
  const received = actual === undefined ? "undefined" : JSON.stringify(actual);
  switch (expectation.type) {
    case "equals": {
      const ok = String(actual) === String(expectation.value);
      return ok
        ? { ok: true, detail: "" }
        : {
            ok: false,
            detail: `expected ${JSON.stringify(expectation.value)}, received ${received}`,
          };
    }
    case "truthy": {
      return actual
        ? { ok: true, detail: "" }
        : { ok: false, detail: `expected a truthy value, received ${received}` };
    }
    case "falsy": {
      return !actual
        ? { ok: true, detail: "" }
        : { ok: false, detail: `expected a falsy value, received ${received}` };
    }
    case "contains": {
      return String(actual).includes(expectation.value)
        ? { ok: true, detail: "" }
        : {
            ok: false,
            detail: `expected ${received} to contain ${JSON.stringify(expectation.value)}`,
          };
    }
    default:
      return { ok: false, detail: "unknown expectation type" };
  }
};

/**
 * Verifies page state after an action task, independently of the model.
 */
export const checkVerification = async (
  verification: EvalVerification,
  page: Page,
): Promise<{ ok: boolean; detail: string }> => {
  const locator = page.locator(verification.locator).first();
  const raw =
    verification.inputValue !== undefined
      ? await locator.inputValue()
      : await locator.textContent();
  const actual = (raw ?? "").trim();

  if (verification.inputValue !== undefined) {
    return actual === verification.inputValue.trim()
      ? { ok: true, detail: "" }
      : {
          ok: false,
          detail: `expected input ${JSON.stringify(verification.inputValue)}, received ${JSON.stringify(actual)}`,
        };
  }
  if (verification.text !== undefined) {
    return actual === verification.text.trim()
      ? { ok: true, detail: "" }
      : {
          ok: false,
          detail: `expected text ${JSON.stringify(verification.text)}, received ${JSON.stringify(actual)}`,
        };
  }
  if (verification.contains !== undefined) {
    return actual.includes(verification.contains)
      ? { ok: true, detail: "" }
      : {
          ok: false,
          detail: `expected text to contain ${JSON.stringify(verification.contains)}, received ${JSON.stringify(actual)}`,
        };
  }
  return { ok: false, detail: "verification has no expected value" };
};

const checkTask = async (
  task: EvalCorpusTask,
  page: Page,
  value: unknown,
): Promise<{ ok: boolean; detail: string }> => {
  const failures: string[] = [];
  if (task.expect) {
    const check = checkExpectation(task.expect, value);
    if (!check.ok) {
      failures.push(check.detail);
    }
  }
  if (task.verify) {
    const check = await checkVerification(task.verify, page);
    if (!check.ok) {
      failures.push(check.detail);
    }
  }
  return failures.length === 0
    ? { ok: true, detail: "" }
    : { ok: false, detail: `${task.id}: ${failures.join("; ")}` };
};

/**
 * Reads telemetry records appended to a JSONL file. Sequential task execution
 * makes a consumed-line cursor enough; records from earlier tasks are never
 * re-counted.
 */
class TelemetryReader {
  private consumed = 0;

  public constructor(private readonly file: string) {}

  public readNew(): Gen2EStepTelemetry[] {
    if (!existsSync(this.file)) {
      return [];
    }
    const lines = readFileSync(this.file, "utf8")
      .split("\n")
      .filter((line) => line.trim() !== "");
    const fresh = lines.slice(this.consumed);
    this.consumed = lines.length;
    return fresh.map((line) => JSON.parse(line) as Gen2EStepTelemetry);
  }
}

const telemetryMetrics = (
  records: Gen2EStepTelemetry[],
  fallbackWallClockMs: number,
): Omit<TaskExecution, "status" | "detail"> => {
  let attempts = 0;
  let toolCalls = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let wallClockMs = 0;
  let costUsd: number | undefined;
  let cache: Gen2EStepTelemetry["cache"] = "miss";

  for (const record of records) {
    attempts = Math.max(attempts, record.attempts ?? 0);
    toolCalls += record.toolCalls ?? 0;
    promptTokens += record.promptTokens ?? 0;
    completionTokens += record.completionTokens ?? 0;
    totalTokens += record.totalTokens ?? 0;
    wallClockMs += record.wallClockMs ?? 0;
    cache = record.cache ?? cache;
    if (typeof record.costUsd === "number" && Number.isFinite(record.costUsd)) {
      costUsd = (costUsd ?? 0) + record.costUsd;
    }
  }

  return {
    attempts,
    retries: Math.max(attempts - 1, 0),
    toolCalls,
    promptTokens,
    completionTokens,
    totalTokens,
    ...(costUsd !== undefined ? { costUsd } : {}),
    wallClockMs: wallClockMs > 0 ? wallClockMs : fallbackWallClockMs,
    cache,
  };
};

const isFixtureReachable = async (url: string): Promise<boolean> => {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
    return response.ok;
  } catch (_error) {
    return false;
  }
};

const resolveTsxCli = (): string => {
  try {
    return require.resolve("tsx/cli");
  } catch (_error) {
    return path.join(REPO_ROOT, "node_modules", ".bin", "tsx");
  }
};

/**
 * Starts the fixture app as a child process on its own port, or reuses an
 * already reachable instance. The returned `stop` is a no-op when reused.
 */
const ensureFixtureServer = async (port: number): Promise<FixtureServer> => {
  const baseUrl = fixtureUrl(port);
  if (await isFixtureReachable(baseUrl)) {
    return { baseUrl, stop: () => {} };
  }

  const child = spawn(process.execPath, [resolveTsxCli(), SERVER_SCRIPT], {
    cwd: PACKAGE_DIR,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout?.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr?.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.on("error", (error) => {
    output += messageOf(error);
  });

  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `fixture server exited with code ${child.exitCode} before becoming reachable:\n${output}`,
      );
    }
    if (await isFixtureReachable(baseUrl)) {
      return { baseUrl, stop: () => child.kill() };
    }
    await sleep(200);
  }

  child.kill();
  throw new Error(`fixture server did not become reachable at ${baseUrl} within 30s:\n${output}`);
};

/**
 * Resolves the cache directory used by replay mode. A model run with
 * `EVAL_RUNS > 1` writes per-repetition directories, so replay falls back to
 * the most recent `rep-*` directory that contains steps.
 */
export const resolveReplayStaticPath = (basePath: string): string => {
  if (existsSync(path.join(basePath, "steps"))) {
    return basePath;
  }
  if (!existsSync(basePath)) {
    return basePath;
  }

  let entries: string[] = [];
  try {
    entries = readdirSync(basePath);
  } catch (_error) {
    return basePath;
  }

  const reps = entries
    .filter((entry) => /^rep-\d+$/.test(entry))
    .sort((a, b) => Number(b.slice(4)) - Number(a.slice(4)));
  for (const rep of reps) {
    const candidate = path.join(basePath, rep);
    if (existsSync(path.join(candidate, "steps"))) {
      return candidate;
    }
  }
  return basePath;
};

const executeTask = async ({
  task,
  browser,
  baseUrl,
  mode,
  model,
  staticPath,
  reader,
  maxAttempts,
  screenshot,
}: {
  task: EvalCorpusTask;
  browser: Browser;
  baseUrl: string;
  mode: EvalMode;
  model: string;
  staticPath: string;
  reader: TelemetryReader;
  maxAttempts: number;
  screenshot: Gen2EScreenshotUsagePolicy;
}): Promise<TaskExecution> => {
  process.env.GEN2E_STATIC_PATH = staticPath;
  const startedAt = Date.now();
  const context = await browser.newContext();

  try {
    const page = await context.newPage();
    await page.goto(new URL(task.url, baseUrl).toString());

    let value: unknown;
    let genError: unknown;
    try {
      value = await gen(
        task.task,
        { page },
        {
          model,
          replayOnly: mode === "replay",
          policies: { maxRetries: maxAttempts, screenshot },
        },
        { store: FSStaticStore },
      );
    } catch (error) {
      genError = error;
    }

    const metrics = telemetryMetrics(reader.readNew(), Date.now() - startedAt);

    if (!genError) {
      try {
        const check = await checkTask(task, page, value);
        return {
          status: check.ok ? "passed" : "failed",
          ...metrics,
          cache: mode === "replay" ? "hit" : metrics.cache,
          detail: check.ok ? undefined : check.detail,
        };
      } catch (error) {
        return {
          status: "failed",
          ...metrics,
          cache: mode === "replay" ? "hit" : metrics.cache,
          detail: `verification failed: ${messageOf(error)}`,
        };
      }
    }

    if (genError instanceof Gen2ECacheMissError) {
      return mode === "replay"
        ? { status: "miss", ...metrics, cache: "replay", detail: genError.message }
        : { status: "hard-error", ...metrics, cache: "miss", detail: genError.message };
    }

    if (genError instanceof Gen2EStaleCacheError) {
      if (mode === "replay") {
        const reason = `replay evaluation failed: ${messageOf(genError.meta?.errorMessage ?? genError)}`;
        let detail = `quarantined ${genError.ident}: ${messageOf(genError)}`;
        try {
          FSStaticStore.quarantine?.(genError.ident, reason);
        } catch (error) {
          detail = `${detail}; quarantine failed: ${messageOf(error)}`;
        }
        return { status: "quarantined", ...metrics, cache: "miss", detail };
      }
      return { status: "failed", ...metrics, detail: messageOf(genError) };
    }

    return {
      status: mode === "replay" ? "hard-error" : "failed",
      ...metrics,
      detail: messageOf(genError),
    };
  } catch (error) {
    return {
      status: "hard-error",
      attempts: 0,
      retries: 0,
      toolCalls: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      wallClockMs: Date.now() - startedAt,
      cache: "miss",
      detail: `task infrastructure failed: ${messageOf(error)}`,
    };
  } finally {
    await context.close().catch(() => {});
  }
};

const aggregateTask = (task: EvalCorpusTask, executions: TaskExecution[]): EvalTaskReport => {
  const runs = executions.length;
  const passedExecutions = executions.filter((execution) => execution.status === "passed");
  const passedAt1 = executions.filter(
    (execution) => execution.status === "passed" && execution.attempts <= 1,
  ).length;
  const sum = (pick: (execution: TaskExecution) => number): number =>
    executions.reduce((acc, execution) => acc + pick(execution), 0);
  const costExecutions = executions.filter((execution) => execution.costUsd !== undefined);
  const costUsd =
    costExecutions.length > 0 ? sum((execution) => execution.costUsd ?? 0) : undefined;
  const errors = [
    ...new Set(
      executions
        .map((execution) => execution.detail)
        .filter((detail): detail is string => !!detail),
    ),
  ];

  return {
    id: task.id,
    title: task.title,
    kind: task.kind,
    task: task.task,
    runs,
    passed: passedExecutions.length,
    failed: executions.filter((execution) => execution.status === "failed").length,
    passAt1: runs === 0 ? 0 : passedAt1 / runs,
    successWithinK: runs === 0 ? 0 : passedExecutions.length / runs,
    attempts: sum((execution) => execution.attempts),
    retries: sum((execution) => execution.retries),
    toolCalls: sum((execution) => execution.toolCalls),
    promptTokens: sum((execution) => execution.promptTokens),
    completionTokens: sum((execution) => execution.completionTokens),
    totalTokens: sum((execution) => execution.totalTokens),
    ...(costUsd !== undefined ? { costUsd } : {}),
    wallClockMs: sum((execution) => execution.wallClockMs),
    cacheHits: executions.filter((execution) => execution.cache === "hit").length,
    cacheMisses: executions.filter(
      (execution) => execution.cache === "miss" || execution.cache === "replay",
    ).length,
    quarantined: executions.filter((execution) => execution.status === "quarantined").length,
    hardErrors: executions.filter((execution) => execution.status === "hard-error").length,
    errors,
  };
};

const summarize = (tasks: EvalTaskReport[], minPass: number, mode: EvalMode): EvalSummary => {
  const totalRuns = tasks.reduce((acc, task) => acc + task.runs, 0);
  const passedAt1 = tasks.reduce((acc, task) => acc + Math.round(task.passAt1 * task.runs), 0);
  const passedWithinK = tasks.reduce(
    (acc, task) => acc + Math.round(task.successWithinK * task.runs),
    0,
  );
  const costTasks = tasks.filter((task) => task.costUsd !== undefined);
  const costUsd =
    costTasks.length > 0
      ? costTasks.reduce((acc, task) => acc + (task.costUsd ?? 0), 0)
      : undefined;
  const hardErrors = tasks.reduce((acc, task) => acc + task.hardErrors, 0);
  const quarantined = tasks.reduce((acc, task) => acc + task.quarantined, 0);

  let exitCode = 0;
  if (hardErrors > 0) {
    exitCode = 1;
  }
  if (mode === "replay") {
    if (quarantined > 0) {
      exitCode = 1;
    }
  } else if (tasks.some((task) => task.passAt1 < minPass)) {
    exitCode = 1;
  }

  return {
    tasks: tasks.length,
    passedTasks: tasks.filter((task) => task.runs > 0 && task.passed === task.runs).length,
    passAt1: totalRuns === 0 ? 0 : passedAt1 / totalRuns,
    successWithinK: totalRuns === 0 ? 0 : passedWithinK / totalRuns,
    cacheHits: tasks.reduce((acc, task) => acc + task.cacheHits, 0),
    cacheMisses: tasks.reduce((acc, task) => acc + task.cacheMisses, 0),
    quarantined,
    hardErrors,
    promptTokens: tasks.reduce((acc, task) => acc + task.promptTokens, 0),
    completionTokens: tasks.reduce((acc, task) => acc + task.completionTokens, 0),
    totalTokens: tasks.reduce((acc, task) => acc + task.totalTokens, 0),
    ...(costUsd !== undefined ? { costUsd } : {}),
    wallClockMs: tasks.reduce((acc, task) => acc + task.wallClockMs, 0),
    minPass,
    exitCode,
  };
};

const resultLabel = (task: EvalTaskReport): string => {
  if (task.hardErrors > 0) {
    return "hard-error";
  }
  if (task.quarantined > 0) {
    return "quarantined";
  }
  if (task.failed > 0) {
    return "failed";
  }
  if (task.runs > 0 && task.passed === task.runs) {
    return "pass";
  }
  if (task.cacheMisses > 0) {
    return "miss";
  }
  return "partial";
};

/**
 * Renders the compact table printed at the end of a run.
 */
export const formatReport = (report: EvalReport): string => {
  const widths = [26, 11, 7, 9, 9, 8, 6, 10, 12, 9, 10];
  const columns = [
    "id",
    "kind",
    "pass@1",
    "within-k",
    "attempts",
    "retries",
    "tools",
    "tokens",
    "cost",
    "wall",
    "result",
  ];
  const row = (cells: (string | number)[]): string =>
    cells.map((cell, index) => String(cell).padEnd(widths[index])).join(" ");
  const cost = (value?: number): string => (value === undefined ? "-" : `$${value.toFixed(6)}`);

  const lines = [
    `gen2e eval — mode=${report.mode} model=${report.model} runs=${report.runs} maxAttempts=${report.maxAttempts} screenshot=${report.screenshot}`,
    `static: ${report.staticPaths.join(", ")}`,
    `telemetry: ${report.telemetryPath}`,
    `report: ${report.reportPath}`,
    "",
    row(columns),
    ...report.tasks.map((task) =>
      row([
        task.id,
        task.kind,
        task.passAt1.toFixed(2),
        task.successWithinK.toFixed(2),
        task.attempts,
        task.retries,
        task.toolCalls,
        task.totalTokens,
        cost(task.costUsd),
        `${(task.wallClockMs / 1000).toFixed(2)}s`,
        resultLabel(task),
      ]),
    ),
    "",
    `summary: pass@1=${report.summary.passAt1.toFixed(2)} within-k=${report.summary.successWithinK.toFixed(2)} tasks=${report.summary.tasks} passed=${report.summary.passedTasks} cache-hits=${report.summary.cacheHits} cache-misses=${report.summary.cacheMisses} quarantined=${report.summary.quarantined} hard-errors=${report.summary.hardErrors} tokens=${report.summary.totalTokens} cost=${cost(report.summary.costUsd)} wall=${(report.summary.wallClockMs / 1000).toFixed(2)}s`,
    `exit code: ${report.summary.exitCode}`,
  ];

  return lines.join("\n");
};

const resolveScreenshot = (value?: string): Gen2EScreenshotUsagePolicy => {
  const policy = (value ?? "off").trim().toLowerCase();
  if (!SCREENSHOT_POLICIES.includes(policy as Gen2EScreenshotUsagePolicy)) {
    throw new Error(
      `invalid screenshot policy "${value}"; expected one of ${SCREENSHOT_POLICIES.join(", ")}`,
    );
  }
  return policy as Gen2EScreenshotUsagePolicy;
};

type PreviousEnv = {
  staticPath?: string;
  telemetry?: string;
  telemetryPath?: string;
};

const captureEnv = (): PreviousEnv => ({
  staticPath: process.env.GEN2E_STATIC_PATH,
  telemetry: process.env.GEN2E_TELEMETRY,
  telemetryPath: process.env.GEN2E_TELEMETRY_PATH,
});

const restoreEnv = (previous: PreviousEnv): void => {
  const entries: [string, string | undefined][] = [
    ["GEN2E_STATIC_PATH", previous.staticPath],
    ["GEN2E_TELEMETRY", previous.telemetry],
    ["GEN2E_TELEMETRY_PATH", previous.telemetryPath],
  ];
  for (const [key, value] of entries) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
};

/**
 * Runs the corpus and returns the full report. Throws on configuration and
 * infrastructure failures; task-level failures are reported in the result and
 * reflected in `summary.exitCode`.
 */
export const run = async (options: EvalRunOptions = {}): Promise<EvalReport> => {
  const mode: EvalMode =
    options.mode ?? (process.env.EVAL_MODE?.trim().toLowerCase() === "replay" ? "replay" : "model");
  const corpusPath = path.resolve(options.corpusPath ?? DEFAULT_CORPUS);
  const corpus = loadCorpus(corpusPath);
  const runs = Math.max(1, Math.floor(options.runs ?? envNumber("EVAL_RUNS", 1)));
  const minPass = options.minPass ?? envNumber("EVAL_MIN_PASS", 0);
  const maxAttempts = Math.max(
    1,
    Math.floor(options.maxAttempts ?? envNumber("EVAL_MAX_ATTEMPTS", 3)),
  );
  const screenshot = resolveScreenshot(options.screenshot ?? process.env.EVAL_SCREENSHOT);
  const port = options.port ?? FIXTURE_PORT;

  const pinnedModel = (options.model ?? process.env.GEN2E_EVAL_MODEL ?? "").trim();
  if (mode === "model" && pinnedModel === "") {
    throw new Error(
      "GEN2E_EVAL_MODEL is required in model mode: export the pinned model id, e.g. GEN2E_EVAL_MODEL=gpt-4o-mini",
    );
  }
  if (mode === "model" && (process.env.OPENAI_API_KEY ?? "").trim() === "") {
    throw new Error(
      "OPENAI_API_KEY is required in model mode; use `npm run eval:replay` to replay an existing cache without a key",
    );
  }
  const model = pinnedModel !== "" ? pinnedModel : env.OPENAI_MODEL;
  if (mode === "replay" && pinnedModel === "") {
    console.warn(
      `GEN2E_EVAL_MODEL is not set; replaying with "${model}". Cache identities include the model id, so set it to the model used to generate the cache.`,
    );
  }

  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 8)}`;
  const runDir = path.resolve(`.static-eval/${runId}`);
  const baseStaticPath = path.resolve(
    options.staticPath ??
      process.env.EVAL_STATIC_PATH ??
      (mode === "model" ? `.static-eval/${runId}` : ".static-eval/latest"),
  );
  const staticPaths =
    mode === "model"
      ? runs === 1
        ? [baseStaticPath]
        : Array.from({ length: runs }, (_, index) => path.join(baseStaticPath, `rep-${index + 1}`))
      : [resolveReplayStaticPath(baseStaticPath)];
  const telemetryPath = path.resolve(
    options.telemetryPath ??
      process.env.EVAL_TELEMETRY_PATH ??
      path.join(runDir, "telemetry.jsonl"),
  );
  const reportPath = path.resolve(
    options.reportPath ?? process.env.EVAL_REPORT ?? "eval-report.json",
  );

  const startedAt = new Date().toISOString();
  const fixture =
    options.manageServer === false
      ? { baseUrl: fixtureUrl(port), stop: () => {} }
      : await ensureFixtureServer(port);

  const previousEnv = captureEnv();
  process.env.GEN2E_TELEMETRY = "1";
  process.env.GEN2E_TELEMETRY_PATH = telemetryPath;
  gen.useStatic = true;

  const reader = new TelemetryReader(telemetryPath);
  const executions = new Map<string, TaskExecution[]>();
  let browser: Browser | undefined;

  try {
    browser = await chromium.launch();
    for (let rep = 0; rep < runs; rep++) {
      for (const task of corpus.tasks) {
        const staticPath = mode === "replay" ? staticPaths[0] : staticPaths[rep];
        const execution = await executeTask({
          task,
          browser,
          baseUrl: fixture.baseUrl,
          mode,
          model,
          staticPath,
          reader,
          maxAttempts,
          screenshot,
        });
        const list = executions.get(task.id) ?? [];
        list.push(execution);
        executions.set(task.id, list);
      }
    }
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    fixture.stop();
    restoreEnv(previousEnv);
  }

  const taskReports = corpus.tasks.map((task) =>
    aggregateTask(task, executions.get(task.id) ?? []),
  );
  const summary = summarize(taskReports, minPass, mode);
  const report: EvalReport = {
    mode,
    runId,
    model,
    runs,
    maxAttempts,
    screenshot,
    baseUrl: fixture.baseUrl,
    staticPaths,
    telemetryPath,
    reportPath,
    startedAt,
    finishedAt: new Date().toISOString(),
    tasks: taskReports,
    summary,
  };

  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatReport(report));
  return report;
};

/**
 * Parses CLI flags. Kept separate from `run` so the harness can be driven by
 * tests through the exported function.
 */
export const parseArgs = (argv: string[]): EvalRunOptions => {
  const options: EvalRunOptions = {};
  const number = (raw: string, flag: string): number => {
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      throw new Error(`invalid number for ${flag}: ${raw}`);
    }
    return value;
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const next = (): string => {
      const value = argv[++index];
      if (value === undefined) {
        throw new Error(`missing value for ${arg}`);
      }
      return value;
    };

    switch (arg) {
      case "--replay":
        options.mode = "replay";
        break;
      case "--model":
        options.model = next();
        break;
      case "--runs":
        options.runs = number(next(), arg);
        break;
      case "--min-pass":
        options.minPass = number(next(), arg);
        break;
      case "--max-attempts":
        options.maxAttempts = number(next(), arg);
        break;
      case "--static-path":
        options.staticPath = next();
        break;
      case "--report":
        options.reportPath = next();
        break;
      case "--telemetry":
        options.telemetryPath = next();
        break;
      case "--corpus":
        options.corpusPath = next();
        break;
      case "--help":
      case "-h":
        console.log(USAGE);
        process.exit(0);
        break;
      default:
        throw new Error(`unknown argument "${arg}"\n\n${USAGE}`);
    }
  }

  return options;
};

const main = async (): Promise<void> => {
  try {
    const options = parseArgs(process.argv.slice(2));
    const report = await run(options);
    process.exitCode = report.summary.exitCode;
  } catch (error) {
    console.error(`gen2e eval failed: ${messageOf(error)}`);
    process.exitCode = 1;
  }
};

if (require.main === module) {
  void main();
}
