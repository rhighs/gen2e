<h1 align="center">gen2e</h1>

<p align="center">
  <b>Write Playwright tests in plain English.</b><br>
  An agent writes each step against the live page, runs it, and fixes it until it works. Then the step is cached on disk.<br>
  After that, your suite replays plain Playwright with no model calls.
</p>

<p align="center">
  <a href="#quickstart">Quickstart</a> ·
  <a href="#models">Models</a> ·
  <a href="#configuration">Configuration</a> ·
  <a href="packages/gen2e-cli">CLI</a> ·
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

```ts
test(
  "search",
  gen.test(async ({ page, gen }) => {
    await page.goto("https://example.com");
    await gen('type "funny cats" in the search box', { page, test });
    await gen("click the search button", { page, test });
  }),
);
```

On the first run, gen2e writes each step to `.static/steps/`:

```json
{
  "expression": "(async () => { await page.locator(\"[data-testid=\\\"search-input\\\"]\").fill(\"funny cats\") })",
  "context": { "task": "type \"funny cats\" in the search box", "testTitle": "search" },
  "meta": { "model": "gpt-4o-mini", "promptVersion": "2026-11-13.1" }
}
```

Commit the directory. Later runs and CI execute this file without calling a model.

## Why gen2e

- **Steps are run before they are cached.** The agent submits its code through a tool that runs it on the real page. If the code throws, the agent sees the error, and the new DOM if the page changed, in the same conversation and tries again.
- **Re-runs are deterministic.** The cache key is the test title, the task, the page origin, the model and the prompt version. If one of these changes, only that step is generated again.
- **Stale steps are generated again.** If a cached locator stops matching the page, gen2e generates the step again. Set `GEN2E_STALE_CACHE=fail` to fail the test instead.
- **Replay-only mode for CI.** With `GEN2E_REPLAY_ONLY=1`, gen2e only reads the cache. A cache miss fails the test, and no API key is needed.
- **Cost ladder.** The first attempt can use a cheaper model and only the DOM. Retries use your main model and can include screenshots.
- **Tests stay normal Playwright tests.** `gen.test(...)` wraps your test function, so you keep the same runner, fixtures and report.
- **Any model.** Use an OpenAI model id, any OpenAI-compatible endpoint, or any [AI SDK](https://ai-sdk.dev) provider model.

## Quickstart

gen2e needs Node 22.12 or newer.

```bash
npm install -D @rhighs/gen2e @playwright/test
export OPENAI_API_KEY="sk-..."
```

```ts
import { expect, test } from "@playwright/test";
import { gen } from "@rhighs/gen2e";

test(
  "reads the heading",
  gen.test(async ({ page, gen }) => {
    await page.goto("https://example.com");
    const heading = await gen("get the header text", { page, test });
    expect(heading).toBe("Example Domain");
  }),
);
```

```bash
npx playwright test
```

The first run generates, runs and caches each step. The next run replays `.static/` and makes no model calls.

`gen` returns whatever the step's code returns: use it for actions, or ask for a value and assert on it with `expect`. Outside a test, call `gen(task, { page })`; nothing is cached then.

## Models

A model id string goes to OpenAI, or to any OpenAI-compatible endpoint when you set a base URL:

```bash
export OPENAI_API_KEY="your-key"
export OPENAI_BASE_URL="https://your-endpoint/v1"
export GEN2E_MODEL="your-model-id"
```

Any AI SDK model works too, per call or in `gen2e.config.ts`:

```ts
import { anthropic } from "@ai-sdk/anthropic";

await gen("click the login button", { page, test }, { model: anthropic("claude-sonnet-4-5") });
```

## Configuration

`gen2e.config.ts` in the working directory is loaded automatically. Each value can also be passed per call as the third argument of `gen`.

```ts
import type { Gen2EConfig } from "@rhighs/gen2e";

export default {
  model: "gpt-4o-mini",
  cheapModel: "gpt-4o-mini",
  policies: { maxRetries: 3, screenshot: "onfail" },
} satisfies Gen2EConfig;
```

| Setting                  | What it does                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------- |
| `policies.maxRetries`    | How many times the agent may run code on the page before the step fails. Default 3.    |
| `policies.screenshot`    | `model` (vision models only), `onfail`, `force` or `off`.                              |
| `cheapModel`, `ladder`   | Try a cheaper model with the DOM only first; switch to the main model after a failure. |
| `GEN2E_REPLAY_ONLY=1`    | Serve only from the cache. A miss fails the test.                                      |
| `GEN2E_STALE_CACHE=fail` | Fail instead of regenerating a cached step whose locator stopped matching.             |
| `GEN2E_STATIC_PATH`      | Cache directory. Default `.static`.                                                    |
| `GEN2E_TELEMETRY=1`      | Write one JSON line per step to `.gen2e/telemetry.jsonl`.                              |

## How it works

Each step is one agent run (`runAgent` in `@rhighs/gen2e-llm`, built on the AI SDK):

1. The agent gets the task and the page DOM, plus a screenshot if the policy allows.
2. It calls `run_expression` with Playwright code. Code that does not parse is sent back without running.
3. The code runs on the page. On success the run ends and the code is cached.
4. On failure the error goes back to the agent, with the current DOM if the page changed, until `maxRetries` runs have failed.

## Packages

| Package                                                   | What it does                                                                                               |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [`@rhighs/gen2e`](packages/gen2e)                         | The library: `gen`, `gen.test`, the step agent and the static store.                                       |
| [`@rhighs/gen2e-cli`](packages/gen2e-cli)                 | Compiles `.gen2e` instruction files to specs. Also has a live recorder, a REPL and page-object generation. |
| [`@rhighs/gen2e-interpreter`](packages/gen2e-interpreter) | Compiles lists of English instructions to gen2e or Playwright code.                                        |
| [`@rhighs/gen2e-llm`](packages/gen2e-llm)                 | The AI SDK model layer and the agent loop: tools, events, usage.                                           |
| [`@rhighs/gen2e-po`](packages/gen2e-po)                   | Generates page objects, with an agent that fixes TypeScript errors.                                        |
| [`@rhighs/gen2e-store`](packages/gen2e-store)             | Store backends: file system, in-memory and CI cache bundles.                                               |
| [`@rhighs/gen2e-core`](packages/gen2e-core)               | Shared contracts, cache identity, errors, pricing and telemetry.                                           |
| [`@rhighs/gen2e-logger`](packages/gen2e-logger)           | A colored logger with no dependencies.                                                                     |

## License

MIT. See [LICENSE](LICENSE).
