# Cache

The static store is what makes gen2e cheap enough to run in CI. Each solved step is written once and then replayed.

## Layout

`FSStaticStore` (the default) writes one file per step to `.static/steps/<md5>.gen.step`:

```json
{
  "expression": "(async () => { await page.locator(\"[data-testid=\\\"search-input\\\"]\").fill(\"gen2e\") })",
  "context": { "task": "type \"gen2e\" in the search box", "testTitle": "search" },
  "meta": {
    "generatedAt": "2026-10-02T15:34:44.200Z",
    "model": "gpt-4o-mini",
    "promptVersion": "2026-10-02.1"
  }
}
```

Writes are atomic, and the first writer wins. When a cached expression fails at evaluation time, the store moves its file to `.static/quarantine/`.

## Cache key

The key is a hash of the test title, the task, the page origin, the model and the prompt version. If you reword a task or switch models, only the affected steps are generated again. Everything else is replayed.

## In CI

Commit `.static/`, or restore it from a CI cache. Then run with:

```bash
GEN2E_REPLAY_ONLY=1 npx playwright test
```

In this mode gen2e makes no model calls and needs no API key. Any step that is not in the cache fails with `Gen2ECacheMissError`.

`@rhighs/gen2e-store` has `exportStoreToDir` and `importDirIntoStore`. They write the cache to `gen2e-static-bundle.json` and read it back, so you can upload and restore the cache as one CI artifact.

## When a cached step goes stale

If a cached locator stops matching the page, the default behavior (`GEN2E_STALE_CACHE=regen`) is to generate the step again and overwrite the file. Set `GEN2E_STALE_CACHE=fail` to throw `Gen2EStaleCacheError` instead.

## Custom stores

```ts
import type { StaticGenStep } from "@rhighs/gen2e";

const memory = new Map<string, StaticGenStep>();

test(
  "custom store",
  gen.test(
    async ({ page, gen }) => {
      /* ... */
    },
    {
      store: {
        makeIdent: (title, task) => `${title}::${task}`,
        fetchStatic: (ident) => memory.get(ident),
        makeStatic: (ident, content) => memory.set(ident, content),
      },
    },
  ),
);
```

`@rhighs/gen2e-store` also exports `InMemoryStaticStore`.

## Paths and switches

- `GEN2E_STATIC_PATH` moves the cache directory.
- `GEN2E_PRELOAD_ENABLED=1` loads every step into memory at startup.
- `GEN2E_USE_STATIC_STORE=0` turns caching off.
