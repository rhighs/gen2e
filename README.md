<h1 align="center">gen2e</h1>

<p align="center">
  <b>Write Playwright tests in plain English.</b><br>
  An agent writes each step against the live page, runs it, and fixes it until it works. Then the step is cached on disk.<br>
  After that, your suite replays plain Playwright with no model calls.
</p>

<p align="center">
  <a href="#quickstart">Quickstart</a> ·
  <a href="#writing-tests">Writing tests</a> ·
  <a href="#commands">Commands</a> ·
  <a href="#configuration">Configuration</a> ·
  <a href="examples/basic">Example</a> ·
  <a href="CONTRIBUTING.md">Contributing</a>
  <br>
  <a href="https://www.npmjs.com/package/@rhighs/gen2e"><img alt="npm" src="https://img.shields.io/npm/v/@rhighs/gen2e.svg"></a>
  <a href="https://github.com/rhighs/gen2e/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/rhighs/gen2e/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
</p>

## Before and after

```ts
test("search", async ({ page }) => {
  await page.goto("https://example.com");
  await page.locator("#main > div.hero form input[name='q']").fill("funny cats");
  await page.locator("button.btn-primary:nth-child(2)").click();
});
```

```
# search.gen2e
open https://example.com
type "funny cats" in the search box
click the search button
assert the results mention cats
```

On the first run, gen2e writes each step to `.static/steps/`:

```json
{
  "expression": "(async () => { await page.getByRole(\"searchbox\").fill(\"funny cats\") })",
  "context": { "task": "type \"funny cats\" in the search box", "testTitle": "search" },
  "meta": { "model": "gpt-4o-mini", "promptVersion": "2026-11-13.2" }
}
```

Commit the directory. Later runs and CI execute this code without calling a model.

## Why gen2e

- **Steps are run before they are cached.** The agent submits its code through a tool that runs it on the real page. If the code throws, the agent sees the error, and the new DOM if the page changed, and tries again.
- **Re-runs are deterministic.** The cache key is the test title, the task, the page origin, the model and the prompt version. If one of these changes, only that step is generated again.
- **Stale steps are generated again.** If a cached locator stops matching the page, gen2e generates the step again. Set `GEN2E_STALE_CACHE=fail` to fail the test instead.
- **Replay-only mode for CI.** With `GEN2E_REPLAY_ONLY=1`, gen2e only reads the cache. A cache miss fails the test, and no API key is needed.
- **No lock-in.** Tests run on Playwright's test runner, and `gen2e eject` turns cached `.gen2e` files into plain Playwright specs.
- **Any model.** Use an OpenAI model id, any OpenAI-compatible endpoint, or any [AI SDK](https://ai-sdk.dev) provider model.

## Quickstart

gen2e runs on [Bun](https://bun.com) 1.4 or newer.

```bash
bun add -d @rhighs/gen2e
export OPENAI_API_KEY="sk-..."
```

Write `login.gen2e`:

```
open https://example.com/login
type {{user}} in the email field
type {{password}} in the password field
click sign in
assert the dashboard greets {{user}}
```

Run every test under the current directory:

```bash
bunx gen2e --var user=ada@example.com --var password="$PASSWORD"
```

gen2e installs Chromium on the first run. The first run generates, runs and caches each step. The next run replays `.static/` with no model calls.

In CI, install the browser with its system packages and replay the committed cache:

```bash
bunx playwright install --with-deps chromium
GEN2E_REPLAY_ONLY=1 bunx gen2e
```

[`examples/basic`](examples/basic) is a runnable project with a small app, a `.gen2e` file and a spec.

## Writing tests

### `.gen2e` files

One step per line:

- `open <url>` goes to the URL, relative to `baseURL` when one is set.
- `assert <statement>` fails the test when the statement is false on the page.
- A line starting with `#` is a comment. Blank lines are skipped.
- Any other line is an action or a question for the agent.

Each file is one test, named after its path.

### Specs

`*.gen2e.ts` files are Playwright specs. Import `test` and `expect` from gen2e to get the `ai` fixture:

```ts
import { expect, test } from "@rhighs/gen2e";
import { z } from "zod";

test("checkout", async ({ ai, page }) => {
  await page.goto("/shop");
  await ai("add the cheapest product to the cart");

  const cart = await ai.extract(
    "read the cart total and item count",
    z.object({ total: z.number(), items: z.number() }),
  );
  expect(cart.items).toBe(1);

  await ai.assert("the cart shows a free-shipping badge");
});
```

- `ai(task)` runs one step and returns whatever its code returns.
- `ai.extract(task, schema)` checks the value against the zod schema while the agent works, and again on every cached replay, so a changed page shape fails instead of returning bad data.
- `ai.assert(task)` throws `Gen2EAssertionError` when the check is false. Assertions are never regenerated from the cache, so a real regression stays a failure.
- Each call takes options as its last argument: `model`, `policies`, `vars`, `replayOnly` and so on.

### Variables

`{{name}}` placeholders keep values out of the prompt, the cache and telemetry. The model sees only the names and writes `vars.name`, so one cached step works for any value. Values come from `vars` in the config, from `--var name=value`, or from the `vars` option of a call.

### Outside the runner

`gen(task, { page })`, `gen.extract` and `gen.assert` work on any Playwright page, for scripts and other runners.

## Commands

| Command                                 | What it does                                                                                    |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `gen2e [run] [paths...]`                | Runs the tests under the current directory, or under the given files and directories.           |
| `gen2e record <file.gen2e> [--url <u>]` | Opens a browser, replays the file, then runs each line you type and appends the ones that pass. |
| `gen2e eject [paths...] [--out <dir>]`  | Writes a plain Playwright spec next to each `.gen2e` file, from its cached steps.               |

`run` passes other flags to Playwright, for example `--headed`, `--workers=1` or `--grep=login`.

Recorded steps are cached under the same key as `run` uses, so the first run after a recording replays without a model.

## Models

A model id string goes to OpenAI, or to any OpenAI-compatible endpoint when you set a base URL:

```bash
export OPENAI_API_KEY="your-key"
export OPENAI_BASE_URL="https://your-endpoint/v1"
export GEN2E_MODEL="your-model-id"
```

Any AI SDK model works too, in the config or per call:

```ts
import { anthropic } from "@ai-sdk/anthropic";

await ai("click the login button", { model: anthropic("claude-sonnet-4-5") });
```

## Configuration

`gen2e.config.ts` in the directory you run gen2e from is loaded automatically.

```ts
import { defineConfig } from "@rhighs/gen2e";

export default defineConfig({
  model: "gpt-4o-mini",
  policies: { maxRetries: 3, screenshot: "onfail" },
  vars: { user: "ada@example.com" },
  playwright: {
    use: { baseURL: "http://localhost:3000" },
    webServer: { command: "bun run dev", url: "http://localhost:3000" },
  },
});
```

| Setting                  | What it does                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| `tests`                  | Globs for the test files. Default `**/*.gen2e` and `**/*.gen2e.ts`.                              |
| `vars`                   | Values for `{{name}}` placeholders. `--var` overrides them.                                      |
| `playwright`             | Playwright config: `use`, `webServer`, `retries`, `reporter` and so on. gen2e sets the projects. |
| `policies.maxRetries`    | How many times the agent may run code on the page before the step fails. Default 3.              |
| `policies.screenshot`    | `model` (vision models only), `onfail`, `force` or `off`.                                        |
| `cheapModel`, `ladder`   | Try a cheaper model with the DOM only first; switch to the main model after a failure.           |
| `GEN2E_REPLAY_ONLY=1`    | Serve only from the cache. A miss fails the test.                                                |
| `GEN2E_STALE_CACHE=fail` | Fail instead of regenerating a cached step whose locator stopped matching.                       |
| `GEN2E_STATIC_PATH`      | Cache directory. Default `.static`.                                                              |
| `GEN2E_TELEMETRY=1`      | Write one JSON line per step to `.gen2e/telemetry.jsonl`.                                        |

## How it works

Each step is one agent run (`runAgent` in `@rhighs/gen2e-llm`, built on the AI SDK):

1. The agent gets the task and the page DOM, plus a screenshot if the policy allows.
2. It calls `run_expression` with Playwright code. Code that does not parse is sent back without running.
3. The code runs on the page. On success the run ends and the code is cached.
4. On failure the error goes back to the agent, with the current DOM if the page changed, until `maxRetries` runs have failed.

`gen2e run` finds the test files, then starts Playwright's test runner under Bun with a config that loads `.gen2e` files and your specs as two projects.

## Limits and trust

- Each step runs code written by a model inside your test process, with the same access as your tests. gen2e refuses code that touches `process`, `require`, `globalThis`, `Function` or `constructor`, and tells the model that page content is data, not instructions. That reduces the risk; it is not a sandbox. Run gen2e against sites you trust, and keep secrets out of task text.
- The page DOM, and screenshots when the policy allows them, are sent to your model provider.
- A cached step is plain JavaScript in `.static/`. Review it like any other code you commit.

Report security issues as described in [SECURITY.md](SECURITY.md).

## Packages

| Package                                         | What it does                                                         |
| ----------------------------------------------- | -------------------------------------------------------------------- |
| [`@rhighs/gen2e`](packages/gen2e)               | The `gen2e` command, the `ai` fixture, the step agent and the cache. |
| [`@rhighs/gen2e-llm`](packages/gen2e-llm)       | The AI SDK model layer and the agent loop: tools, events, usage.     |
| [`@rhighs/gen2e-store`](packages/gen2e-store)   | Store backends: file system, in-memory and CI cache bundles.         |
| [`@rhighs/gen2e-core`](packages/gen2e-core)     | Shared contracts, cache identity, errors, pricing and telemetry.     |
| [`@rhighs/gen2e-logger`](packages/gen2e-logger) | A colored logger with no dependencies.                               |

## License

MIT. See [LICENSE](LICENSE).
