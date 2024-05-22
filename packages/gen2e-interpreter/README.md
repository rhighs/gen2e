# Gen2E Interpreter

Implementations for NL interpreters generating gen2e code or playwright code. With this interpreter, you can navigate web pages interactively or convert a list of plain English tasks into compiled playwright code.

## Getting started

1. Installing

```bash
npm install @rhighs/gen2e-interpreter -D
```

2. This package relies on talking with OpenAI (https://openai.com/). You must export the API token as an enviroment variable or add it to your `.env` file:

```bash
export OPENAI_API_KEY='sk-..."
```

3. Try and form up a runnable script like the following:

```typescript
import { tasksInterpreter } from '@rhighs/gen2e-interpreter';

// dummy function for the example's sake
const options = initOptions();

const verbose = options.verbose ? true : false;
const isDebug = options.debug ? true : undefined;
const model = options.model ? String(options.model).trim() : undefined;
const gen2eModel = options.gen2eModel;
const pwModel = options.pwModel;
const imode = options.imode;
const showStats = options.stats ?? false;
const apiKey = options.openaiApiKey ? String(options.openaiApiKey).trim() : undefined;

const tasksSource = `
go to google.com
click on accept all
assert the page title is "Google"
type "funny cats" in the search bar
press enter on the keyboard
`

const tasks = tasksSource
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.length > 0);

const result = await tasksInterpreter(
  {
    mode: imode,
  },
  {
    model,
    playwrightModel: pwModel,
    gen2eModel: gen2eModel,
    debug: isDebug,
    openaiApiKey: apiKey,
    recordUsage: showStats,
  }
)
  .on("start", () => {
    if (!isDebug) {
      debug("Generating expressions...");
    }
  })
  .on("ai-message", (_, message) => {
    if (isDebug) {
      debug("ai message", message);
    }
  })
  .on("task-success", (i, result: Gen2EExpression) => {
    if (!isDebug) {
      if (verbose) {
        info(`task step "${result.task}" has generated code:\n${result.expression}`);
      }
    }
  })
  .on("task-error", (_, error: Error | string) => {
    err("Failed generating expression due to error:");
    err(error);
    err("Aborting...");
    process.exit(1);
  })
  .run(tasks);

process.stdout.write(`${result.result}\n`);

if (result.usageStats) {
  info("interpreter usage stats report", result.usageStats);
}
```

## What the Interpreter Does

The tasks interpreter handles task execution using either the `gen2e` or `playwright` mode. It uses custom LLM based agents to generate expressions based on provided tasks. The interpreter supports custom event hooks and usage statistics recording.

### Modes of Operation

#### gen2e Mode

In `gen2e` mode, the interpreter generates expressions using a custom agent and evaluates them within the given context. This mode is primarily for generating and interpreting natural language instructions into executable code that includes assertions and correct use of the gen2e function calls.

#### Playwright Mode

In `playwright` mode, the interpreter uses Playwright to interact with web pages. It can execute tasks that involve browser automation, making it suitable for end-to-end testing scenarios. It does so by evaluationg code that is generate in fashion similar to the gen2e mode, it uses a sandboxed environment to simulate how a test would run.

### Sandbox Evaluation

Generated code must run correctly and safely, thus the interpreter uses a sandbox environment for code evaluation. This is particularly useful for testing and recording changes to a static store as it is used in a Playwright context. The static store functions as a way to record the generated code, which will be of use later for AST manipulations.

The `sandboxEval` function executes a given fake E2E test source code in a sandboxed environment, allowing injection of a static store to record generated code. Running this function requires the use of a browser instance, otherwise we won't be able to generate any playwright expression.

#### Getting an idea of sandbox usage

```typescript
import { sandboxEval } from '@righs/gen2e-interpreter';
import { Page } from '@playwright/test';
import { StaticStore } from '@rhighs/gen2e';

const gen2eTestSource = `
test("a fake test", 
  gen.test(async ({ page, gen }) => {
    await gen("goto google.com", { page, test });
    await gen("click on accept all", { page, test }); 
    const pageTitle = await gen("get the page title", { page, test });
    expect(pageTitle).toBe("Google");
    await gen(
      "type \"silly dogs\" in the search bar and then press enter on the keyboard",
      { page, test }
    );
  })
)
`;

const page: Page;
const inMemStatic = {};
const store: StaticStore = {
  makeStatic: (testTitle: string, task: string) => `${testTitle} - ${task}`
  fetchStatic: (ident: string) => inMemStatic[ident],
  makeStatic: (content: StaticGenStep) => (inMemStatic[content.ident] = content.expression),
};

;(async () => {
  await sandboxEval(gen2eTestSource, page, store, undefined, {
    model: 'gpt-3.5-turbo',
    openaiApiKey: 'your-api-key-here',
  }, (code, page) => {
    const evalFunc = new Function('page', `return (async () => { const result = await ${code}(); return result })()`);
    return evalFunc(page);
  });
  process.stdout.write(JSON.stringify(inMemStatic, null, 4) + "\n");
})()
```

### Converting gen2e code to playwright code

The interpreter can convert gen2e code into playwright code by working on it's AST. gen2e IL syntax is replaced at runtime with the corresponding native Playwright expressions fetched from the static store (injected in the sandbox evaluation step).

#### Generation briefly explained

1. **Generate gen2e expressions**: the interpreter generates gen2e expressions based on the provided tasks using custom agents.

2. **Eval in sandbox**: each generated expression is evaluated in a sandboxed environment, here we capture the static code generated.

3. **Compile to playwright code**: finally, we use a codemod to perform code substitutions replacing call expressions to gen2e with call expressions to anonymous functions (containing the static code). Why anonymous? well these might contain one or more intructions or even use return statements, wrapping these in an executable block prevents parsing errors.

  > - **Identifying test definitions**: scan the source code for test definitions that use gen2e syntax. This primary step mainly swaps `gen.test` test block with plain playwright arrow functions `({ page }) => {...}`.
  >- **Fetch static expressions**: For each gen2e task, use the static store to fetch precompiled Playwright expressions. The static store maps task identifiers to their corresponding Playwright code snippets.
  > - **Replace gen2e calls**: replace `gen('...')` calls with the corresponding Playwright expressions.
  > - **Marking test titles**: To mark the compilation process add a tag `:compilation-output` to the test title.

The ending result will be a playwright test with no dependencies to the gen2e library.


## Environment variables
```ts
# show debug logs for AST edits
GEN2EI_DEBUG_AST=0

# sets the default model used by the interpreter, with a fallback to "gpt-3.5-turbo" if not specified
GEN2EI_MODEL="gpt-4o"

# show debug logs for the custom agents
GEN2EI_MODEL_DBG=0

OPENAI_API_KEY=<your-api-key>
```