# @rhighs/gen2e-po

This package generates typed Playwright page objects from `gen2e-cli recorder` dumps. It includes an agent that edits the generated TypeScript until the compiler reports no diagnostics.

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

The CLI equivalent is `gen2e-cli po-gen ./dumps --root-dir ./page-objects`. The default model is `GEN2EPO_MODEL`, or `gpt-4o` when that is unset.

MIT licensed.
