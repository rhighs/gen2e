# CLI, interpreter and page objects

## CLI

```bash
npm install -g @rhighs/gen2e-cli
```

A `.gen2e` file has one English instruction per line:

```text
# search.gen2e
Navigate to google.com
Click on "accept all" if a privacy modal is present
Type "Where the aliens at?" in the search bar and press enter
```

To compile it to a Playwright spec:

```bash
gen2e-cli generate search.gen2e --imode playwright --model gpt-4o-mini --out tests/search.spec.ts
```

| Command           | What it does                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| `generate <file>` | Compiles a `.gen2e` file to Playwright code (`--imode playwright`) or to gen2e IL (`--imode gen2e`). |
| `recorder`        | Opens a live browser and records instructions one at a time.                                         |
| `repl`            | An interactive session with a live browser.                                                          |
| `po-gen <dir>`    | Generates page objects from recorder dumps.                                                          |

Common flags:

- `--model`, `--gen2e-model`, `--pw-model`
- `--base-url`, `--openai-api-key`
- `--max-retries`
- `--screenshot force|model|onfail|off`
- `--visual-debug none|medium|high`
- `--stats`, `--debug`

Run `gen2e-cli <command> --help` to see every flag.

## Interpreter

`@rhighs/gen2e-interpreter` turns a list of instructions into code. This is the library the CLI runs on.

```ts
import { recordingInterpreter } from "@rhighs/gen2e-interpreter";

const interpreter = recordingInterpreter(
  { mode: "playwright" },
  {
    model: "gpt-4o-mini",
    playwrightModel: "gpt-4o",
    recordUsage: true,
    policies: { maxRetries: 3, screenshot: "onfail" },
  },
);

await interpreter.start();
await interpreter.update("go to google.com");
await interpreter.update('search for "funny cats"');
const { code } = await interpreter.finish();
```

You can use a small model for gen2e expressions (`model` / `gen2eModel`) and a stronger one for the final Playwright code (`playwrightModel`).

## Page objects

`@rhighs/gen2e-po` generates typed page objects from recorder dumps. It includes an agent that fixes TypeScript errors: it keeps correcting imports and types until the compiler reports no diagnostics.

```ts
import { Gen2EPOGenerator, loadDumps } from "@rhighs/gen2e-po";

const dumps = await loadDumps("./dumps");
const generator = new Gen2EPOGenerator({ model: "gpt-4o", staticDataDir: "./page-objects" });

for (const dump of dumps) {
  const blocks = dump.blocks.flatMap((b) => b.blocks);
  for (let i = 0; i < blocks.length; i++) {
    await generator.generate(blocks[i], blocks[i + 1]);
  }
}
```
