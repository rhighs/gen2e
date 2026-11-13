# Writing tests

## Actions, queries and assertions

Each `gen` call is one step. The model returns a single Playwright expression, and `gen` returns whatever that expression returns:

- An **action**, such as a click, returns nothing.
- A **query** returns a value.
- For an **assertion**, query the value and assert on it with `expect`.

```ts
import { expect, test } from "@playwright/test";
import { gen } from "@rhighs/gen2e";

test(
  "docs navigation",
  gen.test(async ({ page, gen }) => {
    await page.goto("https://example.com");

    await gen("click the link that says 'Documentation'", { page, test });

    const title = await gen("get the page title", { page, test });
    expect(title).toBe("Docs");

    const links = await gen("count the links in the nav bar", { page, test });
    expect(Number(links)).toBe(3);
  }),
);
```

Pass `test` in each call. gen2e uses it to show each step in the Playwright report and to build the cache key.

## Per-call options

```ts
await gen(
  "click the submit button",
  { page, test },
  {
    model: "gpt-4o-mini",
    baseURL: "https://your-endpoint.internal/v1",
    openaiApiKey: process.env.MY_ENDPOINT_KEY,
    policies: { maxRetries: 5, screenshot: "force" },
    ladder: { cheapModel: "gpt-4o-mini" },
    replayOnly: false,
    debug: true,
  },
);
```

| Option | Purpose |
|---|---|
| `model`, `baseURL`, `openaiApiKey` | The endpoint and model for this step. See [Configuration](configuration.md). |
| `policies.maxRetries` | How many retries after a failed validation or a failed run. The default is 3. |
| `policies.screenshot` | `model`, `force`, `onfail` or `off`. |
| `ladder` | `true`, `false` or `{ cheapModel, cheapScreenshot }`. With the ladder on, attempt 0 uses the cheap model and only the DOM. |
| `replayOnly` | Only read the cache. A cache miss throws `Gen2ECacheMissError`. |
| `debug` | Log the prompt, the attempts and the result. |

To turn off the cache for one block of tests, set `gen.useStatic = false`. To turn it off everywhere, call `staticStoreEnabled(false)`.

## Outside a test

`gen` also works without a test, for example in scripts or a REPL. Nothing is cached in that case.

```ts
import { chromium } from "@playwright/test";
import { gen } from "@rhighs/gen2e";

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("https://example.com");
console.log(await gen("get the first heading", { page }));
await browser.close();
```

## Screenshots

The default policy is `model`, which attaches a screenshot only when the model is known to accept images. `onfail` adds a screenshot only on retries. `off` sends only the DOM.
