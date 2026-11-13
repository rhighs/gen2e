# Evals

The repo includes an eval harness. It measures how well gen2e generates steps for the fixture app in `packages/gen2e/tests/bin/start-test-server.ts`. The corpus (`packages/gen2e/tests/evals/corpus.json`) has six tasks: queries, actions, assertions and one multi-step flow.

## Model mode

```bash
export OPENAI_API_KEY="..."
export GEN2E_EVAL_MODEL="gpt-4o-mini"
npm run eval
```

Model mode generates each step with the model you pinned. Each repetition writes to its own cache (`.static-eval/<runId>`, or `rep-<n>` when `EVAL_RUNS > 1`) and to a JSONL telemetry file. At the end it prints a table and writes `eval-report.json`.

It reports these metrics for each task:

- pass@1 (the first attempt passed)
- success within `k` attempts
- attempts, retries and tool calls
- prompt, completion and total tokens
- cost, when the model has a price
- wall-clock time

The run exits non-zero in two cases: a task's pass@1 is below `EVAL_MIN_PASS`, or a task throws an error.

## Replay mode

```bash
EVAL_STATIC_PATH=.static-eval/<runId> npm run eval:replay
```

Replay mode never calls a model. It counts cache hits and misses. If a cached entry fails when it runs, replay mode quarantines it and the run exits non-zero. An empty cache gives an all-misses report and exits 0.

## Nightly

`.github/workflows/nightly.yml` builds the project and runs replay mode. It also runs model mode when the `OPENAI_API_KEY` secret is set. Then it uploads `eval-report*.json`.

| Variable | Default | Purpose |
|---|---|---|
| `GEN2E_EVAL_MODEL` | none | The pinned model id. Model mode requires it, and replay mode must use the same id. |
| `EVAL_RUNS` | `1` | Repetitions per task. |
| `EVAL_MIN_PASS` | `0` | The lowest pass@1 a task may have before the run fails. |
| `EVAL_MAX_ATTEMPTS` | `3` | Attempts per step (the `k` in success within `k`). |
| `EVAL_SCREENSHOT` | `off` | The screenshot policy. |
| `EVAL_STATIC_PATH` | run-scoped | Where model mode writes the cache, and which cache replay mode reads. |
| `EVAL_REPORT` | `eval-report.json` | Where the report is written. |
| `EVAL_TELEMETRY_PATH` | `<runDir>/telemetry.jsonl` | Where the telemetry JSONL is written. |
