![Gen2E — plain English in, precise Playwright steps out](docs/assets/gen2e-banner.jpg)

# Gen2E

**Write Playwright tests in plain English.** Gen2E asks a language model for the exact Playwright expression, validates it, runs it against the real page, feeds failures back to the model, and caches every solved step so the next run is as fast as hand-written code.

> **TL;DR: what does Gen2E do?**
> You call `gen("click the login button", { page, test })` inside a Playwright test. Gen2E snapshots the page (DOM plus an optional screenshot), asks a model for a single Playwright expression, validates the output with tools, evaluates it in the browser, and retries with the error text when it fails. Successful expressions are stored in a static store keyed by test title and task, so re-runs skip the model entirely. Gen2E talks to OpenAI or any endpoint that speaks the OpenAI API — one base URL, one API key, any model id.

Made by Roberto Montalti · TypeScript · Node 20+ · `github.com/rhighs/gen2e`

---

## Contents

- [Why Gen2E](#why-gen2e)
- [Packages](#packages)
- [Quickstart](#quickstart)
- [How it works](#how-it-works)
- [Writing tests](#writing-tests)
  - [Actions, queries and assertions](#actions-queries-and-assertions)
  - [Options per call](#options-per-call)
  - [Standalone generation](#standalone-generation)
- [Models and endpoints](#models-and-endpoints)
  - [OpenAI](#openai)
  - [Any OpenAI-compatible endpoint](#any-openai-compatible-endpoint)
  - [Model resolution rules](#model-resolution-rules)
- [Configuration](#configuration)
- [Static store](#static-store)
- [Evaluation](#evaluation)
- [CLI](#cli)
- [Interpreter](#interpreter)
- [Page objects](#page-objects)
- [Environment variables](#environment-variables)
- [Development](#development)
- [FAQ](#faq)

---

## Why Gen2E

E2E tests are usually written twice: once as a spec, then again as selectors that break whenever the DOM changes. LLM agents can write the selectors for you, but a raw chat call gives you code that was never executed, validated, or cached — so every run costs tokens and every failure costs you a debugging session.

Gen2E closes that loop inside Playwright:

| You get | What it means |
|---|---|
| **English steps** | `gen("type the username and click sign in", { page, test })` — the model resolves locators against a live DOM snapshot. |
| **Validated output** | Every expression passes a format tool and a JavaScript parse check before it is evaluated. Broken output is retried, not executed. |
| **Self-healing retries** | When evaluation throws, the error and the previous attempt are sent back to the model for a different solution. |
| **Deterministic re-runs** | Solved steps are cached by `test title + task` in a static store; a green suite replays cached code without model calls. |
| **Real Playwright** | `gen.test(...)` wraps your test function. No new runner, no fixtures to adopt, no vendor test format. |
| **Model freedom** | OpenAI or any OpenAI-compatible endpoint — one base URL and API key, any model id that endpoint serves. |
| **Recording + page objects** | The CLI records instructions into compiled specs, and can turn test dumps into typed page objects. |

---

## Packages

| Package | Description |
|---|---|
| [`@rhighs/gen2e`](./packages/gen2e) | The library: `gen`, `gen.test`, static stores, snapshots, evaluation loop. |
| [`@rhighs/gen2e-core`](./packages/gen2e-core) | Store contracts, cache identity, errors, pricing and telemetry types shared across packages. No runtime dependencies. |
| [`@rhighs/gen2e-store`](./packages/gen2e-store) | Static store implementations: file system (atomic writes, quarantine), in-memory, and CI cache bundle helpers. |
| [`@rhighs/gen2e-llm`](./packages/gen2e-llm) | Model runners and code-gen agents: OpenAI-compatible endpoint support, tool validation, usage stats. |
| [`@rhighs/gen2e-interpreter`](./packages/gen2e-interpreter) | Natural-language interpreter that compiles instruction lists into gen2e IL or Playwright code. |
| [`@rhighs/gen2e-cli`](./packages/gen2e-cli) | `gen2e-cli generate`, `recorder`, `repl` and `po-gen` commands. |
| [`@rhighs/gen2e-po`](./packages/gen2e-po) | Page object generation and a TypeScript error-solving agent. |
| [`@rhighs/gen2e-logger`](./packages/gen2e-logger) | Dependency-free colored logger used by every package. |

---

## Quickstart

Install the library next to Playwright:

```bash
npm install @rhighs/gen2e -D
```

Point Gen2E at a model. Either export an OpenAI key:

```bash
export OPENAI_API_KEY="sk-..."
```

or point Gen2E at any OpenAI-compatible endpoint:

```bash
export OPENAI_API_KEY="your-endpoint-key"
export OPENAI_BASE_URL="https://your-endpoint/v1"   # optional, defaults to OpenAI
export GEN2E_MODEL="gpt-4o-mini"
```

Write a test. Everything inside `gen(...)` is plain English; the `test` argument is what makes each step show up in the Playwright report:

```ts
import { test, expect } from "@playwright/test";
import { gen } from "@rhighs/gen2e";

test(
  "search flow",
  gen.test(async ({ page, gen }) => {
    await page.goto("https://example.com");

    // a query: the model returns a value
    const headerText = await gen("get the header text", { page, test });
    expect(headerText).toBe("Example Domain");

    // an action: nothing is returned
    await gen('type "funny cats" in the search box', { page, test });

    // an assertion: ask for the value, assert it yourself
    const searchValue = await gen("get the search box value", { page, test });
    expect(searchValue).toBe("funny cats");
  }),
);
```

Run it like any Playwright test. The first run calls the model for each step; the second run replays the cached expressions and never touches the network.

---

## How it works

```
task ──► snapshot page (DOM + optional screenshot)
          │
          ▼
      code-gen agent ──► tools: format validation, JS parse check
          │                    │
          │                    ▼ (invalid) retry with the reason
          ▼
      eval expression in the browser
          │
          ├── throws ──► retry with error + previous attempt
          │
          ▼
      store expression in the static store (key: test title + task)
```

1. **Snapshot.** Gen2E reads the page DOM, and for vision-capable models attaches a screenshot. Screenshot policy is configurable: `model`, `force`, `onfail` or `off`.
2. **Generate.** The code-gen agent gets the task, the snapshot and a system prompt that teaches it gen2e/Playwright conventions, then calls the model with tools attached.
3. **Validate.** The model must call the format tool and the JavaScript/JSON validation tool before returning; invalid output is rejected and retried.
4. **Evaluate.** The expression runs against the real page. On failure the error text is added to the next attempt, up to `maxRetries`.
5. **Cache.** The successful expression is written to the static store, so the next run for the same task in the same test is a plain function call.

---

## Writing tests

### Actions, queries and assertions

```ts
// Action: perform something, ignore the result
await gen("click the link that says 'Documentation'", { page, test });

// Query: get a value back
const title = await gen("get the page title", { page, test });
expect(title).toBe("Gen2E");

// Assertion: get the value, assert outside the gen call
const links = await gen("count the links in the nav bar", { page, test });
expect(Number(links)).toBe(3);
```

### Options per call

```ts
await gen(
  "click the submit button",
  { page, test },
  {
    model: "gpt-4o-mini", // override the model for this step
    baseURL: "https://your-endpoint.internal/v1",
    openaiApiKey: process.env.MY_ENDPOINT_KEY,
    policies: { maxRetries: 5, screenshot: "force" },
    debug: true,
  },
);
```

`gen.useStatic = false` disables the cache for a block of tests, and `staticStoreEnabled(false)` does it globally.

### Standalone generation

`gen` also works outside a test, for scripts and REPLs:

```ts
import { chromium } from "@playwright/test";
import { gen } from "@rhighs/gen2e";

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("https://example.com");

const heading = await gen("get the first heading", { page });
console.log(heading);

await browser.close();
```

---

## Models and endpoints

Gen2E talks to OpenAI or to any endpoint that speaks the OpenAI API. There is no provider-specific integration to configure: a base URL (optional, defaults to OpenAI), an API key, and a model id. The same three values work in `gen` options, `gen2e.config.ts`, `GEN2E_MODEL`, CLI flags, interpreter options and the page-object generator.

### OpenAI

Use an OpenAI model id with `OPENAI_API_KEY`:

```bash
export OPENAI_API_KEY="sk-..."
export GEN2E_MODEL="gpt-4o-mini"   # or gpt-4.1, gpt-5, o3, ...
```

The runner counts tokens and trims oversized prompts, supports tool calls, and attaches screenshots only for vision-capable models.

### Any OpenAI-compatible endpoint

Point the runner at another base URL and use the model ids that endpoint serves. This covers self-hosted proxies, routers, and vendor APIs that expose the OpenAI schema:

```bash
export OPENAI_API_KEY="your-endpoint-key"
export OPENAI_BASE_URL="https://your-endpoint.internal/v1"
export GEN2E_MODEL="your-model-id"
```

Per call:

```ts
await gen("click the login button", { page, test }, {
  model: "your-model-id",
  baseURL: "https://your-endpoint.internal/v1",
  openaiApiKey: process.env.MY_ENDPOINT_KEY,
});
```

Or in `gen2e.config.ts`:

```ts
import type { Gen2EConfig } from "@rhighs/gen2e";

export default {
  model: "your-model-id",
  baseURL: "https://your-endpoint.internal/v1",
  openaiApiKey: process.env.MY_ENDPOINT_KEY,
} satisfies Gen2EConfig;
```

### Model resolution rules

| Value | How it is used |
|---|---|
| `gpt-4o-mini`, `gpt-5`, `o3`, ... | Model id sent to the endpoint. |
| Any other non-empty string | Model id sent to the endpoint; the endpoint decides whether it exists. |
| Empty string | Rejected with `Gen2ELLMGenericError`. |

Credentials come from `openaiApiKey` (option or config), else `OPENAI_API_KEY`. The endpoint comes from `baseURL` (option or config), else `OPENAI_BASE_URL`, else OpenAI. Every runner reports token usage through the `onUsage` hook; the interpreter aggregates it into its stats report.

---

## Configuration

`gen2e.config.ts` in the working directory is loaded automatically. All fields are optional:

```ts
import type { Gen2EConfig } from "@rhighs/gen2e";

export default {
  model: "gpt-4o-mini",
  debug: false,
  staticStorePath: ".static",
  policies: {
    maxRetries: 3,
    screenshot: "model",       // "model" | "force" | "onfail" | "off"
    visualDebugLevel: "medium", // "none" | "medium" | "high"
  },
} satisfies Gen2EConfig;
```

Precedence for every value is: per-call option → `gen2e.config.ts` → environment variable → default.

---

## Static store

The static store is the cache that makes Gen2E practical in CI. By default (`FSStaticStore`) expressions are written under `.static/steps`, named by the MD5 of `test title + task`. Change one task and only that task is regenerated; the rest replay.

```ts
import { gen } from "@rhighs/gen2e";

// custom store for one test
gen.test(async ({ page, gen }) => { /* ... */ }, {
  store: {
    makeIdent: (testTitle, task) => `${testTitle}::${task}`,
    fetchStatic: (ident) => memory.get(ident),
    makeStatic: (ident, content) => memory.set(ident, content),
  },
});
```

Set `GEN2E_STATIC_PATH` to move the directory, `GEN2E_PRELOAD_ENABLED=1` to load steps into memory at startup, and `GEN2E_USE_STATIC_STORE=0` to disable caching.

---

## Evaluation

The repo ships a nightly evaluation harness that measures generation quality against the fixture app in `packages/gen2e/tests/bin/start-test-server.ts`. The corpus is `packages/gen2e/tests/evals/corpus.json`: six tasks covering queries, actions, assertions and a multi-step flow.

```bash
# model mode: generates expressions with the pinned model
export OPENAI_API_KEY="..."
export GEN2E_EVAL_MODEL="gpt-4o-mini"   # required; OPENAI_BASE_URL is optional
npm run eval

# replay mode: no API key, no generation, replays an existing cache
EVAL_STATIC_PATH=.static-eval/<runId> npm run eval:replay
```

Model mode writes each repetition to a run-scoped cache (`.static-eval/<runId>`, or `rep-<n>` subdirectories when `EVAL_RUNS > 1`) and a JSONL telemetry file, prints a table and writes `eval-report.json`. Metrics per task: pass@1 (first attempt), success within `k` attempts, attempts, retries, tool calls, prompt/completion/total tokens, cost when the model is priced, and wall-clock. The process exits non-zero when any task's pass@1 is below `EVAL_MIN_PASS` (default 0) or a task hard-errors.

Replay mode never calls a model and never writes expressions. It serves the corpus from `EVAL_STATIC_PATH` (default `.static-eval/latest`), counts cache hits and misses, and quarantines entries whose cached expression fails at evaluation time — a quarantined run exits non-zero. An empty cache produces an all-misses report and exits 0, which is how the nightly replay step runs without an API key.

`.github/workflows/nightly.yml` runs on a schedule and on demand: build, replay step always, model step only when the `OPENAI_API_KEY` secret is configured, then uploads `eval-report*.json`.

| Variable | Default | Purpose |
|---|---|---|
| `GEN2E_EVAL_MODEL` | — | Pinned model id. Required in model mode; replay must use the same id. |
| `EVAL_RUNS` | `1` | Repetitions per task. |
| `EVAL_MIN_PASS` | `0` | Minimum per-task pass@1 in model mode; below it the run fails. |
| `EVAL_MAX_ATTEMPTS` | `3` | Attempts per generation (`k` in success-within-k). |
| `EVAL_SCREENSHOT` | `off` | Screenshot policy for eval runs. |
| `EVAL_STATIC_PATH` | run-scoped | Cache directory (model mode); cache to replay (replay mode). |
| `EVAL_REPORT` | `eval-report.json` | Report path. |
| `EVAL_TELEMETRY_PATH` | `<runDir>/telemetry.jsonl` | Telemetry JSONL path. |

---

## CLI

```bash
npm install -g @rhighs/gen2e-cli
```

A `.gen2e` file is one English instruction per line:

```text
# tasks.gen2e
Navigate to google.com
Click on "accept all" if a privacy modal is present
Type "Where the aliens at?" in the search bar and press enter
```

Compile it to a Playwright spec:

```bash
gen2e-cli generate tasks.gen2e \
  --imode playwright \
  --model gpt-4o-mini \
  --out tests/generated.spec.ts
```

For an OpenAI-compatible endpoint, export `OPENAI_BASE_URL` and the matching key, or pass `--base-url`:

```bash
gen2e-cli generate tasks.gen2e --imode playwright --model your-model-id --base-url "https://your-endpoint.internal/v1"
```

Record instructions one at a time against a live browser:

```bash
gen2e-cli recorder --model openai/gpt-5.4 --screenshot onfail
```

Interactive REPL, or page-object generation from test dumps:

```bash
gen2e-cli repl --model gpt-4o-mini
gen2e-cli po-gen ./dumps --model openai/gpt-5.4 --root-dir ./page-objects
```

Useful flags: `--imode gen2e|playwright`, `--gen2e-model`, `--pw-model`, `--max-retries`, `--screenshot force|model|onfail|off`, `--visual-debug none|medium|high`, `--stats`, `--base-url`, `--openai-api-key`.

---

## Interpreter

`@rhighs/gen2e-interpreter` compiles instruction lists into code, either as gen2e IL or as compiled Playwright:

```ts
import { recordingInterpreter } from "@rhighs/gen2e-interpreter";

const interpreter = recordingInterpreter(
  { mode: "playwright" },
  {
    model: "gpt-4o-mini",
    playwrightModel: "gpt-4o-mini",
    baseURL: process.env.OPENAI_BASE_URL,
    recordUsage: true,
    policies: { maxRetries: 3, screenshot: "onfail", visualDebugLevel: "medium" },
  },
);

interpreter.on("task-success", (_i, result) => console.log(result));

await interpreter.start();
await interpreter.update("go to google.com");
await interpreter.update("click accept all if present");
await interpreter.update('search for "funny cats"');

const { code, tasks, gen2eCode } = await interpreter.finish();
console.log(code); // compiled Playwright test body
```

`playwrightModel` and `gen2eModel` let you spend a small model on gen2e expression generation and a stronger one on raw Playwright code — or the same model for both.

---

## Page objects

`@rhighs/gen2e-po` generates typed page objects from recorder dumps, including a TypeScript error-solving agent that fixes imports and types until diagnostics are clean:

```ts
import { Gen2EPOGenerator, loadDumps } from "@rhighs/gen2e-po";

const dumps = await loadDumps("./dumps");
const generator = new Gen2EPOGenerator({
  model: "gpt-4o-mini",
  codeGenOptions: { baseURL: process.env.OPENAI_BASE_URL },
  staticDataDir: "./page-objects",
});

for (const dump of dumps) {
  const blocks = dump.blocks.flatMap((b) => b.blocks);
  for (let i = 0; i < blocks.length; i++) {
    await generator.generate(blocks[i], blocks[i + 1]);
  }
}
```

---

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | — | Key for OpenAI or the OpenAI-compatible endpoint. |
| `OPENAI_BASE_URL` | OpenAI | Base URL of the endpoint; `GEN2E_BASE_URL` and `GEN2EI_BASE_URL` override it per package. |
| `GEN2E_MODEL` | `gpt-4o-mini` | Default model id for the library. |
| `GEN2E_BASE_URL` | — | Base URL for the library (wins over `OPENAI_BASE_URL`). |
| `GEN2E_STATIC_PATH` | `.static` | Where generated expressions are cached. |
| `GEN2E_USE_STATIC_STORE` | `1` | Enable the static store. |
| `GEN2E_REPLAY_ONLY` | off | Serve from the cache only; a miss throws `Gen2ECacheMissError`. |
| `GEN2E_PRELOAD_ENABLED` | off | Preload cached steps at startup. |
| `GEN2E_DBG` | off | Debug logging. |
| `GEN2E_LOG_STEP` | off | Log each generated expression. |
| `GEN2E_SV_LOG_ERR` | off | Log validation errors during agent calls. |
| `GEN2EI_MODEL` | `gpt-4o-mini` | Default model for the interpreter. |
| `GEN2EI_BASE_URL` | — | Interpreter base URL for OpenAI-compatible endpoints. |
| `GEN2EPO_MODEL` | `gpt-4o` | Default model for page-object generation. |

---

## Development

```bash
npm install
npm run build          # lerna build across packages
npm test               # jest unit tests, all packages
npm run test:integration  # tests that need real API keys (skipped without them)
npm run check          # biome lint + format + import organization
npm run check:fix      # apply safe fixes
npm run format         # biome format --write
npm run lint           # biome lint
```

The repo uses [Biome](https://biomejs.dev) for formatting and linting and Lerna for publishing. `main` is protected by CI: format check, lint, build and tests must pass.

---

## FAQ

**Does Gen2E replace Playwright?**
No. It generates expressions that run inside your existing Playwright tests. Page navigation, fixtures and assertions stay yours.

**What happens when the model is wrong?**
The expression fails validation or throws during evaluation. Gen2E retries with the error text and the previous attempt, up to `maxRetries` (default 3), then fails the step.

**Is the cache safe?**
Cache keys combine test title, task, page origin, prompt version and model. Change the task wording, the model or the prompt version and the step regenerates; change nothing and it replays. Delete `.static` or set `GEN2E_USE_STATIC_STORE=0` to start clean.

**Can I run it without OpenAI?**
Yes. Point `baseURL` or `OPENAI_BASE_URL` at any OpenAI-compatible endpoint and use its key and model ids — see [Models and endpoints](#models-and-endpoints).

**Does it send screenshots to the model?**
Only when the screenshot policy allows it and the model is known to accept images. `screenshot: "off"` guarantees DOM-only prompts.

**Which Node versions are supported?**
Node 20 or newer. The runner uses the OpenAI SDK and ships CommonJS, so it works in Node and bundlers without ESM constraints.

---

## License

MIT © Roberto Montalti
