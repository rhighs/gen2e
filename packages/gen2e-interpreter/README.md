# @rhighs/gen2e-interpreter

This package compiles a list of English instructions into code. It runs each instruction against a live browser and emits either gen2e expressions or plain Playwright code. `gen2e-cli` is built on it.

```bash
npm install -D @rhighs/gen2e-interpreter
export OPENAI_API_KEY="sk-..."
```

```ts
import { recordingInterpreter } from "@rhighs/gen2e-interpreter";

const interpreter = recordingInterpreter(
  { mode: "playwright" },
  { model: "gpt-4o-mini", playwrightModel: "gpt-4o", policies: { maxRetries: 3 } },
);

await interpreter.start();
await interpreter.update("go to google.com");
await interpreter.update('search for "funny cats"');
const { code } = await interpreter.finish();
```

There are two modes:

- `gen2e` emits gen2e calls, which stay cached and regenerate when the page changes.
- `playwright` compiles the solved expressions to plain Playwright code.

The interpreter reads `GEN2EI_MODEL` and `GEN2EI_BASE_URL`, and falls back to `OPENAI_BASE_URL`.

MIT licensed.
