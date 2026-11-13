# @rhighs/gen2e-llm

This is the model layer of [gen2e](https://github.com/rhighs/gen2e), built on the [AI SDK](https://ai-sdk.dev). It provides:

- `runAgent`, a small tool-calling agent loop
- `createCodeGenAgent`, which wraps `runAgent` for code generation

```bash
npm install @rhighs/gen2e-llm
```

## Agent loop

```ts
import { defineTool, resolveModel, runAgent } from "@rhighs/gen2e-llm";
import { z } from "zod";

const lookup = defineTool({
  name: "lookup",
  description: "Returns the stock for a product id.",
  inputSchema: z.object({ id: z.string() }),
  execute: ({ id }) => ({
    output: id === "a1" ? "3 in stock" : "unknown product",
    isError: id !== "a1",
  }),
});

const res = await runAgent({
  model: resolveModel("gpt-4o-mini"),
  instructions: "Answer stock questions with the lookup tool.",
  messages: [{ role: "user", content: "How many a1 do we have?" }],
  tools: [lookup],
  maxTurns: 5,
});

console.log(res.stopReason, res.text, res.usage);
```

Each turn makes one model call. The loop then runs the tool calls in order.

**Tool calls:**

- Each call is checked against the tool's zod schema before it runs.
- An unknown tool, invalid input or a thrown error becomes an error result that the model sees.
- A result with `terminate: true` ends the run.

**The run stops when:**

- the model answers without calling a tool
- a tool result terminates the run
- `maxTurns` is reached
- the signal aborts
- the model call fails

**Hooks:**

- `prepareTurn` can switch the model or add messages before each turn.
- `beforeToolCall` can block a call.
- `onEvent` receives `agent_start`, `turn_start`, `message`, `turn_end`, `tool_start`, `tool_end` and `agent_end`.

## Models

`resolveModel` turns a model id into an AI SDK model:

- Without a base URL, a string id uses OpenAI's Responses API.
- With `baseURL` (or `OPENAI_BASE_URL`), it uses Chat Completions on that endpoint.
- The API key comes from the `apiKey` option or `OPENAI_API_KEY`.
- An AI SDK model instance from any provider is used as is.

## Code generation

`createCodeGenAgent(system, model, opts?, logger?, tools?, lang?)` returns a function. It takes a task and resolves to `{ type: "success", result }` or `{ type: "error", errorMessage }`.

- It adds validation tools for the language: a format check, plus a parse check for JavaScript or JSON.
- It falls back to `opts.fallbackModels` on retryable errors.
- It reports token usage through `onUsage`.

MIT licensed.
