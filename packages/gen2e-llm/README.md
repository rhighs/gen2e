# @rhighs/gen2e-llm

LLM runners and code-generation agents behind [Gen2E](../gen2e). The package owns the model layer: it turns a model id or an AI SDK language model into a runner, attaches validation tools, enforces output format, and reports token usage.

## Install

```bash
npm install @rhighs/gen2e-llm
```

## Quick start

```ts
import { createCodeGenAgent } from "@rhighs/gen2e-llm";

const agent = createCodeGenAgent(
  "You write Playwright expressions. Return code only.",
  "openai/gpt-5.4", // provider/model gateway id
  { gatewayApiKey: process.env.AI_GATEWAY_API_KEY },
);

const result = await agent(
  { task: "click the login button" },
  { onUsage: (usage) => console.log(usage) },
);

if (result.type === "success") {
  console.log(result.result);
}
```

## Models

`createCodeGenAgent(systemMessage, model, options?, logger?, tools?, lang?)` accepts three forms:

| Model | Runner | Notes |
|---|---|---|
| `gpt-4o-mini`, `gpt-5`, `o3`, ... | `Gen2EOpenAIRunner` | Uses the official `openai` SDK, `OPENAI_API_KEY`, optional `baseURL`. |
| `provider/model`, e.g. `openai/gpt-5.4` | `Gen2EVercelRunner` | Routed through the Vercel AI Gateway; `gatewayApiKey` or `AI_GATEWAY_API_KEY`. |
| Any AI SDK language model instance | `Gen2EVercelRunner` | e.g. `gateway("openai/gpt-5.4")` or `createOpenAI({ baseURL })("my-model")`. |

Builder options:

```ts
type Gen2ELLMAgentBuilderOptions = {
  debug?: boolean;
  openaiApiKey?: string;
  gatewayApiKey?: string;
  baseURL?: string;   // OpenAI-compatible endpoints
  maxSteps?: number;  // AI SDK runner, default 10
  temperature?: number; // AI SDK runner, default 0
};
```

Models can also be switched per task through `task.options.model`. The initial runner is created when the agent is built; runners for model overrides are created on demand and cached per model id.

## Runners

### `Gen2EOpenAIRunner`

- Uses `openai.beta.chat.completions.runTools` for multi-step tool calls.
- Trims oversized prompts using the model's context window (`openai-token`).
- Attaches images only when the model is vision-capable; `modelSupportsImage` covers the known OpenAI ids plus gateway heuristics.

### `Gen2EVercelRunner`

- Uses `generateText` with `stopWhen: stepCountIs(maxSteps)` and native tool calling.
- Converts gen2e JSON Schema tools to AI SDK tools with `jsonSchema()`, so custom tool `parse` functions still validate arguments.
- Accepts images as AI SDK `file` parts.
- Reports `totalUsage` across all steps as completion/prompt/total tokens.
- Emits assistant step text through the `onMessage` hook.

## Validation and tools

Every agent gets built-in tools before generation finishes:

- `format_validation_tool` — rejects markdown-wrapped output.
- `code_validation_tool` — parses the output with `esprima` (JavaScript) or `JSON.parse` (JSON).

Custom tools passed to `createCodeGenAgent` are traced (`callCount()`), and their `parse` function receives the JSON stringified model arguments before `function` is called.

## Exports

- `createCodeGenAgent`
- `Gen2EOpenAIRunner`, `Gen2EVercelRunner`
- `isModelSupported`, `isOpenAIModel`, `isGatewayModel`, `isProviderModel`, `modelId`, `modelSupportsImage`
- tool helpers: `makeTool`, `makeFormatTool`, `makeTracedTool`
- sanity helpers: `sanitizeCodeOutput`, `validateJSCode`, `validateJSONString`
- token helpers: `fitsContext`, `maxCharactersApprox`, `countTokens`, `tokenLimits`

## License

MIT © Roberto Montalti
