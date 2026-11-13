# Contributing

We use [Bun](https://bun.com) to install and test, at the version pinned in `packageManager`. gen2e runs on Bun only; the packages ship their TypeScript source and there is no build step. Run `bunx playwright install chromium` in `packages/gen2e` once for the e2e lane.

```bash
bun install
bun run gate
```

`bun run gate` runs these checks, in order:

1. Biome
2. The type check
3. The unit tests
4. The scripted e2e lane: real Chromium against the fixture app, with a scripted model and no API key. It runs the `gen2e` command on the project in `packages/gen2e/tests/runner`, and the reference solution of every eval task, so a broken corpus task fails the gate instead of skewing a score.

CI runs the same command. A pull request is merged only when it passes.

| Command                    | What it runs                                                                                                               |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `bun run check:fix`        | Applies Biome's safe fixes.                                                                                                |
| `bun run test:integration` | The LLM integration tests. They need `OPENAI_API_KEY` and are skipped without it.                                          |
| `bun run test:e2e`         | The live Playwright suite against the fixture app. It needs a model key and Chromium (`bunx playwright install chromium`). |
| `bun run eval:replay`      | The eval corpus, served from a cache.                                                                                      |

`gen2e.config.ts` at the repo root configures local and eval runs: screenshots are off and there are two retries.

## Tests

Unit tests run with `bun test --isolate`. Each file gets a fresh module registry, because `mock.module` would otherwise leak into the other files. `test-setup.ts` clears every mock after each test.

When you mock a module that has a default export, return `{ default: ... }` from the factory. Bun patches the bindings that are already loaded, so a factory without `default` leaves the default export unchanged.

## Known gaps

These are the gaps between this repo and the guidelines we follow. Each one has its reason and the condition for closing it.

| Gap                                                                       | Size            | Reason                                                                                             | Closes when                                                                |
| ------------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `noUncheckedIndexedAccess` is off                                         | 15 errors       | Index access is used without checks in the logger's stack parsing and three test files.            | The errors are fixed and the flag is turned on.                            |
| `exactOptionalPropertyTypes` is off                                       | 24 errors       | Option objects pass `undefined` explicitly.                                                        | The errors are fixed and the flag is turned on.                            |
| zod instead of Effect Schema; errors are thrown, not returned with Effect | 5 files use zod | The AI SDK takes zod tool schemas natively; Effect would add a large dependency for a few schemas. | We adopt Effect across the packages.                                       |
| No runtime dependency ceiling                                             | none            | Not measured yet.                                                                                  | A guard counts runtime dependencies per package against a written ceiling. |

## Releasing

Bump the versions of the packages you changed, then run `bun run release`. It runs the gate and calls `bun publish` in every package. Versions that already exist on npm are skipped. `workspace:^` dependencies are rewritten to the published versions.

## Layout

Dependencies go one way: `core` and `logger` → `store` and `llm` → `gen2e`. `examples/` holds projects that use the published API; the gate type-checks them but does not run them, since they need a model.
