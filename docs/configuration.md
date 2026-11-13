# Configuration

Each value is resolved in this order: per-call option, then `gen2e.config.ts`, then the environment variable, then the default.

## Models and endpoints

gen2e works with OpenAI and with any endpoint that implements the OpenAI API. You set three things: a base URL (optional, OpenAI is the default), an API key, and a model id.

```bash
export OPENAI_API_KEY="your-key"
export OPENAI_BASE_URL="https://your-endpoint.internal/v1"   # omit for OpenAI
export GEN2E_MODEL="gpt-4o-mini"
```

gen2e sends the model id as you wrote it, and the endpoint decides whether that model exists. An empty model id throws `Gen2ELLMGenericError`.

- **API key:** `openaiApiKey` (option or config), otherwise `OPENAI_API_KEY`.
- **Base URL:** `baseURL` (option or config), otherwise `GEN2E_BASE_URL`, otherwise `OPENAI_BASE_URL`, otherwise OpenAI.

The runner counts tokens and trims prompts that are too long. It also supports tool calls and reports usage through the `onUsage` hook.

## `gen2e.config.ts`

gen2e loads this file automatically from the working directory. Every field is optional.

```ts
import type { Gen2EConfig } from "@rhighs/gen2e";

export default {
  model: "gpt-4o-mini",
  baseURL: "https://your-endpoint.internal/v1",
  openaiApiKey: process.env.MY_ENDPOINT_KEY,
  staticStorePath: ".static",
  replayOnly: false,
  ladder: true,
  cheapModel: "gpt-4o-mini",
  policies: {
    maxRetries: 3,
    screenshot: "model",        // "model" | "force" | "onfail" | "off"
    visualDebugLevel: "medium", // "none" | "medium" | "high"
  },
} satisfies Gen2EConfig;
```

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | none | The key for OpenAI or for the OpenAI-compatible endpoint. |
| `OPENAI_BASE_URL` | OpenAI | The endpoint base URL. |
| `GEN2E_MODEL` | `gpt-4o-mini` | The default model for the library. |
| `GEN2E_BASE_URL` | none | The base URL for the library. It takes precedence over `OPENAI_BASE_URL`. |
| `GEN2E_CHEAP_MODEL` | none | The model for the first attempt on the cost ladder. Setting it turns the ladder on. |
| `GEN2E_STATIC_PATH` | `.static` | The cache directory. |
| `GEN2E_USE_STATIC_STORE` | `1` | Turns the cache on or off. |
| `GEN2E_REPLAY_ONLY` | off | Only read the cache. A miss throws `Gen2ECacheMissError`. |
| `GEN2E_STALE_CACHE` | `regen` | When a cached step's locator stops matching: `regen` generates the step again, `fail` throws `Gen2EStaleCacheError`. |
| `GEN2E_PRELOAD_ENABLED` | off | Load the cached steps into memory at startup. |
| `GEN2E_TELEMETRY` | off | Write per-step telemetry to `.gen2e/telemetry.jsonl`. |
| `GEN2E_TELEMETRY_PATH` | none | The telemetry file or directory. Setting it turns telemetry on. |
| `GEN2E_PRICING_FILE` | none | A JSON file that overrides or adds to the per-model prices used for cost estimates. |
| `GEN2E_NETWORKIDLE_TIMEOUT_MS` | built in | How long the snapshot step waits for the network to go idle. |
| `GEN2E_DBG` | off | Debug logging. |
| `GEN2E_LOG_STEP` | off | Log each generated expression. |
| `GEN2E_SV_LOG_ERR` | off | Log validation errors from agent calls. |
| `GEN2EI_MODEL` | `gpt-4o-mini` | The default model for the interpreter. |
| `GEN2EI_BASE_URL` | none | The base URL for the interpreter. |
| `GEN2EPO_MODEL` | `gpt-4o` | The default model for page-object generation. |
