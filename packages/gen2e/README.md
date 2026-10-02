# @rhighs/gen2e

Run and generate Playwright tests using LLMs. Write plain English steps; Gen2E asks a model for the Playwright expression, validates it, executes it, retries on failure, and caches the result.

Part of the [Gen2E monorepo](../../README.md). See the root README for the full product tour, model and endpoint setup and CLI docs.

## Getting started

1. Install:

```bash
npm install @rhighs/gen2e -D
```

2. Pick a model. OpenAI directly:

```bash
export OPENAI_API_KEY="sk-..."
```

or point it at any OpenAI-compatible endpoint:

```bash
export OPENAI_API_KEY="your-endpoint-key"
export OPENAI_BASE_URL="https://your-endpoint.internal/v1"
export GEN2E_MODEL="your-model-id"
```

3. Import `gen` and structure a test:

```ts
import { test, expect } from "@playwright/test";
import { gen } from "@rhighs/gen2e";

test(
  "gen playwright example",
  gen.test(async ({ page, gen }) => {
    await page.goto("/");

    // `gen` can query data
    const headerText = await gen("get the header text", { page, test });

    // `gen` can perform actions
    await gen(`Type "${headerText}" in the search box`, { page, test });

    // `gen` can ask questions; assert the value yourself
    const searchValue = await gen("get the search box value", { page, test });
    expect(searchValue).toBe(headerText);
  }),
);
```

## Usage

Depending on the task, `gen` behaves as an **action**, a **query** or an **assertion**.

### Action

```ts
try {
  await gen("click the link", { page, test });
} catch (e) {
  console.error("failed to click the link");
}
```

### Queries

```ts
const pageTitle = await gen("get the page title", { page, test });
expect(pageTitle).toBe("Gen2E");
```

### Assertions

Ask for the value, then assert outside the call — the model returns data, not test outcomes:

```ts
const thereAreThreeLinks = await gen("are there 3 links on the page?", { page, test });
expect(thereAreThreeLinks).toBe(true);
```

## How it works

Gen2E snapshots the page (DOM plus an optional screenshot for vision models), sends the task and snapshot to a code-generation agent, and receives an atomic Playwright expression. The expression is validated by tools (format + JavaScript parse) and evaluated at runtime. Failures are fed back to the model with the error text for another attempt.

When an expression executes successfully it is stored in a **static store**, keyed by `test title + task`. Subsequent runs fetch the cached expression instead of calling the model, which makes re-runs as fast as hand-written Playwright code and keeps token costs near zero.

### Static stores

A static store is a [small interface](./src/static/store/store.ts) used to fetch, store and identify generated code. The default [`FSStaticStore`](./src/static/store/fs.ts) writes expressions under `.static/steps`, in a file named after the MD5 hash of `test title + task`.

```ts
import type { StaticStore, StaticGenStep } from "@rhighs/gen2e";

const memory = new Map<string, StaticGenStep>();
const memoryStore: StaticStore = {
  makeIdent: (testTitle, task) => `${testTitle}::${task}`,
  fetchStatic: (ident) => memory.get(ident),
  makeStatic: (ident, content) => {
    memory.set(ident, content);
  },
};
```

Pass it per test:

```ts
test(
  "go to google, assert the title then search",
  gen.test(
    async ({ page, gen }) => {
      await gen("goto google.com", { page, test });
      await gen("click on accept all", { page, test });
      const pageTitle = await gen("get the page title", { page, test });
      expect(pageTitle).toBe("Google");
      await gen('type "funny cats" in the search bar and press enter', { page, test });
    },
    { store: memoryStore },
  ),
);
```

Running this the first time performs one agent call per task. The second run replays the cache. Change a single instruction and only that task is regenerated — the rest replay, like incremental compilation.

### Enable/disable static stores

```ts
import { gen } from "@rhighs/gen2e";

gen.useStatic = false;
// ... tests that should always call the model ...
gen.useStatic = true;
```

`staticStoreEnabled(false)` does the same globally.

## Models and endpoints

Anywhere a model is accepted (`gen` options, `gen2e.config.ts`, `GEN2E_MODEL`) you pass a model id, an optional base URL and an API key:

```ts
// OpenAI
await gen("goto google.com", { page, test }, { model: "gpt-4o-mini" });

// Any OpenAI-compatible endpoint
await gen("goto google.com", { page, test }, {
  model: "your-model-id",
  baseURL: "https://your-endpoint.internal/v1",
  openaiApiKey: process.env.MY_ENDPOINT_KEY,
});
```

`OPENAI_API_KEY` and `OPENAI_BASE_URL` are used as defaults, and `baseURL`/`openaiApiKey` can be set in `gen2e.config.ts` too. See the [root README](../../README.md#models-and-endpoints) for configuration files and precedence rules.

## Configuration

`gen2e.config.ts` is loaded from the working directory:

```ts
import type { Gen2EConfig } from "@rhighs/gen2e";

export default {
  model: "gpt-4o-mini",
  baseURL: process.env.OPENAI_BASE_URL,
  debug: false,
  staticStorePath: ".static",
  policies: {
    maxRetries: 3,
    screenshot: "model", // "model" | "force" | "onfail" | "off"
    visualDebugLevel: "medium", // "none" | "medium" | "high"
  },
} satisfies Gen2EConfig;
```

Precedence: per-call option → config file → environment variable → default.

## Environment variables

```
# enables logging for the code validation step in agent calls
GEN2E_SV_LOG_ERR=0

# determines if preloading is enabled for the gen2e static fs file store
GEN2E_PRELOAD_ENABLED

# specifies the path to generated static files, defaults to a `.static` dir
GEN2E_STATIC_PATH=

# enables debug mode, logs more stuff
GEN2E_DBG=1

# sets the default model id served by the OpenAI-compatible endpoint
GEN2E_MODEL="gpt-4o-mini"

# base URL for OpenAI-compatible endpoints (also reads OPENAI_BASE_URL)
GEN2E_BASE_URL=

# enables step-by-step logging in the gen2e process
GEN2E_LOG_STEP=0

# whether to use static stores or not, true by default
GEN2E_USE_STATIC_STORE=1

# model credentials
OPENAI_API_KEY=<your-api-key>
```

## Development

From the monorepo root:

```bash
npm run build
npm test
npm run check
```

## License

MIT © Roberto Montalti
