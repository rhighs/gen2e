# Contributing

## Setup

You need Node 20 or newer.

```bash
npm install
npm run build
```

## Checks

```bash
npm test                  # unit tests, all packages
npm run test:integration  # needs a real API key; skipped without one
npm run check             # biome: lint, format, imports
npm run check:fix         # apply safe fixes
```

CI runs the format check, the lint, the build and the tests on every push and pull request. A pull request is merged only when CI passes.

`gen2e.config.ts` at the repo root configures local runs and eval runs: it turns screenshots off and sets two retries.

## End-to-end tests

```bash
cd packages/gen2e
npm run test:e2e
```

## Layout

The packages are in `packages/*` and are published with Lerna. Dependencies go one way: `core`, `logger` → `store`, `llm` → `gen2e` → `interpreter` → `po` → `cli`.
