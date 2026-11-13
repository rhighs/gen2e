# @rhighs/gen2e

Write Playwright tests in plain English. A model turns each step into Playwright code, gen2e runs it against the live page, and the code is cached on disk. Later runs replay the cache without calling a model.

```bash
bun add -d @rhighs/gen2e
export OPENAI_API_KEY="sk-..."
```

`login.gen2e`, one step per line:

```
open https://example.com/login
type {{user}} in the email field
click sign in
assert the dashboard greets {{user}}
```

Or a spec, `login.gen2e.ts`:

```ts
import { test } from "@rhighs/gen2e";

test("signs in", async ({ ai, page }) => {
  await page.goto("https://example.com/login");
  await ai("sign in as {{user}}", { vars: { user: "ada@example.com" } });
  await ai.assert("the dashboard greets ada");
});
```

```bash
bunx gen2e
```

Commands, configuration and caching are documented in the [repository README](https://github.com/rhighs/gen2e#readme).

MIT licensed.
