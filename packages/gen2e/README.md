# @rhighs/gen2e

You write Playwright test steps in plain English. A model turns each step into one Playwright expression, gen2e runs it against the live page, and the expression is cached on disk. Later runs replay the cache without calling a model.

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

To use another OpenAI-compatible endpoint, set `OPENAI_BASE_URL` and `GEN2E_MODEL`. Any AI SDK model can be passed as `model` too.

Models, configuration and caching are documented in the [repository README](https://github.com/rhighs/gen2e#readme).

MIT licensed.
