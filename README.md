<h1 align="center">gen2e</h1>

<p align="center">
  <b>Write Playwright tests in plain English.</b><br>
  A model writes each step once against the live page. The step is checked, run, and cached on disk.<br>
  After that, your suite replays plain Playwright with no model calls.
</p>

<p align="center">
  <a href="docs/writing-tests.md">Writing tests</a> ·
  <a href="docs/configuration.md">Configuration</a> ·
  <a href="docs/cache.md">Cache</a> ·
  <a href="docs/cli.md">CLI</a> ·
  <a href="docs/evals.md">Evals</a> ·
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
  "meta": { "model": "gpt-4o-mini", "promptVersion": "2026-10-02.1" }
}
```

Commit the directory. Later runs and CI execute this file without calling a model.

## Why gen2e

- **Steps are run before they are cached.** Each expression must pass a format check and a JavaScript parse check, and then it runs against the real page. If it throws, the error goes back to the model for a new attempt.
- **Re-runs are deterministic.** The cache key is the test title, the task, the page origin, the model and the prompt version. If one of these changes, only that step is generated again.
- **Stale steps are generated again.** If a cached locator stops matching the page, gen2e generates the step again. Set `GEN2E_STALE_CACHE=fail` to fail the test instead.
- **Replay-only mode for CI.** With `GEN2E_REPLAY_ONLY=1`, gen2e only reads the cache. A cache miss fails the test, and no API key is needed.
- **Cost ladder.** The first attempt can use a cheaper model and only the DOM. Retries use your main model and can include screenshots.
- **Tests stay normal Playwright tests.** `gen.test(...)` wraps your test function, so you keep the same runner, fixtures and report.
- **Any OpenAI-compatible endpoint.** You need a base URL, an API key and a model id. This works with OpenAI, proxies, routers and self-hosted servers.

## Quickstart

gen2e needs Node 22.12 or newer.

```bash
npm install -D @rhighs/gen2e @playwright/test
export OPENAI_API_KEY="sk-..."
```

To use another OpenAI-compatible endpoint, also set `OPENAI_BASE_URL` and `GEN2E_MODEL`.

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

[Writing tests](docs/writing-tests.md) covers actions, queries, assertions and per-call options.

## How it works

```
task ─► snapshot (DOM, plus a screenshot if the policy allows)
     ─► model returns one Playwright expression
     ─► format and JS parse checks ─(invalid)─► retry with the reason
     ─► run the expression on the page ─(throws)─► retry with the error
     ─► write it to the static store
```

## Packages

| Package                                                   | What it does                                                                                               |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [`@rhighs/gen2e`](packages/gen2e)                         | The library: `gen`, `gen.test`, the evaluation loop and the static store.                                  |
| [`@rhighs/gen2e-cli`](packages/gen2e-cli)                 | Compiles `.gen2e` instruction files to specs. Also has a live recorder, a REPL and page-object generation. |
| [`@rhighs/gen2e-interpreter`](packages/gen2e-interpreter) | Compiles lists of English instructions to gen2e or Playwright code.                                        |
| [`@rhighs/gen2e-llm`](packages/gen2e-llm)                 | The model runner and code-gen agents, with tool validation and usage stats.                                |
| [`@rhighs/gen2e-po`](packages/gen2e-po)                   | Generates page objects, with an agent that fixes TypeScript errors.                                        |
| [`@rhighs/gen2e-store`](packages/gen2e-store)             | Store backends: file system, in-memory and CI cache bundles.                                               |
| [`@rhighs/gen2e-core`](packages/gen2e-core)               | Shared contracts, cache identity, errors, pricing and telemetry.                                           |
| [`@rhighs/gen2e-logger`](packages/gen2e-logger)           | A colored logger with no dependencies.                                                                     |

## License

MIT. See [LICENSE](LICENSE).
