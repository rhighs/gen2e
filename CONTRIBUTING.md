# Contributing

We use [Bun](https://bun.com) to install, build and test, at the version pinned in `packageManager`. The published packages target Node 20 or newer.

```bash
bun install
bun run gate
```

`bun run gate` runs Biome, the type check, the build and the unit tests, in that order. CI runs the same command. A pull request is merged only when it passes.

| Command | What it runs |
|---|---|
| `bun run check:fix` | Applies Biome's safe fixes. |
| `bun run test:integration` | The LLM integration tests. They need `OPENAI_API_KEY` and are skipped without it. |
| `bun run test:e2e` | The Playwright suite against the fixture app. It needs a model key and Chromium (`bunx playwright install chromium`). |
| `bun run eval:replay` | The eval corpus, served from a cache. See [docs/evals.md](docs/evals.md). |

`gen2e.config.ts` at the repo root configures local and eval runs: screenshots are off and there are two retries.

## Tests

Unit tests run with `bun test --isolate`. Each file gets a fresh module registry, because `mock.module` would otherwise leak into the other files. `test-setup.ts` clears every mock after each test.

When you mock a module that has a default export, return `{ default: ... }` from the factory. Bun patches the bindings that are already loaded, so a factory without `default` leaves the default export unchanged.

## Releasing

Bump the versions of the packages you changed, then run `bun run release`. It runs the gate and calls `bun publish` in every package. Versions that already exist on npm are skipped. `workspace:^` dependencies are rewritten to the published versions.

## Layout

Dependencies go one way: `core` and `logger` → `store` and `llm` → `gen2e` → `interpreter` → `po` → `cli`.
