# @rhighs/gen2e-llm

LLM runners and code-generation agents behind [Gen2E](../gen2e). The package owns the model layer: it turns a model id into a runner, attaches validation tools, enforces output format, and reports token usage.

Everything goes through the OpenAI SDK against a configurable OpenAI-compatible endpoint, so one code path covers OpenAI and any compatible API (self-hosted proxy, router or vendor endpoint).

## Install

```bash
npm install @rhighs/gen2e-llm
```

## Quick start

```ts
import { createCodeGenAgent } from "@rhighs/gen2e-llm";

const agent = createCodeGenAgent(
  "You write Playwright expressions. Return code only.",
  "gpt-4o-mini", // any model id served by the endpoint
  {
    openaiApiKey: process.env.MY_ENDPOINT_KEY,
    baseURL: "https://my-endpoint.internal/v1", // omit for OpenAI
  },
);

const result = await agent(
  { task: "click the login button" },
  { onUsage: (usage) => console.log(usage) },
);

if (result.type === "success") {
  console.log(result.result);
}
```

## Models and endpoints

`createCodeGenAgent(systemMessage, model, options?, logger?, tools?, lang?)` accepts any non-empty model id string. The endpoint decides which models exist; `openaiApiKey` and `baseURL` select where requests go.

Builder options:

```ts
type Gen2ELLMAgentBuilderOptions = {
  debug?: boolean;
  openaiApiKey?: string; // falls back to OPENAI_API_KEY
  baseURL?: string;      // falls back to OPENAI_BASE_URL, then OpenAI
  promptVersion?: string; // reported in usage stats for cache invalidation
};
```

Models can also be switched per task through `task.options.model`. The initial runner is created when the agent is built; runners for model overrides are created on demand and cached per model id.

## Runner

`Gen2EOpenAIRunner` is the only runner:

- Uses `openai.beta.chat.completions.runTools` for multi-step tool calls.
- Works against OpenAI or any OpenAI-compatible base URL.
- Trims oversized prompts using the model's context window (`openai-token`).
- Attaches images only when the model is vision-capable (`modelSupportsImage`); screenshot policy `force` overrides.

## Validation and tools

Every agent gets built-in tools before generation finishes:

- `format_validation_tool` — rejects markdown-wrapped output.
- `code_validation_tool` — parses the output with `esprima` (JavaScript) or `JSON.parse` (JSON).

Custom tools passed to `createCodeGenAgent` are traced (`callCount()`), and their `parse` function receives the JSON stringified model arguments before `function` is called.

## Exports

- `createCodeGenAgent`
- `Gen2EOpenAIRunner`
- `isModelSupported`, `modelId`, `modelSupportsImage`
- tool helpers: `makeTool`, `makeFormatTool`, `makeTracedTool`
- sanity helpers: `sanitizeCodeOutput`, `validateJSCode`, `validateJSONString`
- token helpers: `fitsContext`, `maxCharactersApprox`, `countTokens`, `tokenLimits`

## License

MIT © Roberto Montalti
