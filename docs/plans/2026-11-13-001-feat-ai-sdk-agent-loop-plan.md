# AI SDK model layer and agent loop

Status: in progress, 2026-11-13.

## Problem

Today `gen2e-llm` calls models through the OpenAI SDK's `runTools`. That has three problems:

- It only reaches OpenAI-shaped endpoints.
- It hides the tool loop inside the SDK.
- It returns the final text and nothing else.

gen2e then wraps that call in a retry loop of its own (`evalLoop` in `packages/gen2e/src/gen.ts`). Each retry starts a new conversation, re-sends the DOM, and passes earlier failures in as prose. The model never sees the result of running its own expression in the conversation where it wrote it.

## Goal

1. Model calls go through the Vercel AI SDK (`ai`), so any AI SDK provider works.
2. gen2e owns a small agent loop, modeled on `@mariozechner/pi-agent-core`. That loop drives every LLM interaction.
3. A gen2e step becomes one agent run. In that run the model executes its expression on the page with a tool, sees the error or the result, and retries in the same conversation.

## Decisions

| ID  | Decision                                                                                                                                                                                                                           | Rejected alternative and why                                                                                                                                                                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | We write our own loop on top of `generateText`, one step per turn, with tools passed without `execute`. The loop executes tool calls itself.                                                                                       | `ToolLoopAgent` and `generateText({ stopWhen })`. gen2e needs four things they make awkward: stopping on an accepted tool input, injecting a user message (a fresh snapshot or screenshot) after tool results, switching the model per turn, and events in our own shape for telemetry. |
| D2  | A model is either a model id string or an AI SDK `LanguageModel`. With no `baseURL`, a string resolves to `createOpenAI({ apiKey }).responses(id)`. With a `baseURL`, it resolves to `createOpenAI({ baseURL, apiKey }).chat(id)`. | `createOpenAICompatible`: a second provider package for the same wire format. Always using `.chat()`: the AI SDK docs require the Responses API for tool calling on GPT-6.                                                                                                              |
| D3  | Tool inputs use zod 4 schemas through AI SDK `tool()`-compatible `inputSchema`.                                                                                                                                                    | Effect Schema: the guidelines prefer it, but it would add `effect` for four schemas. It stays in the Known gaps table in `CONTRIBUTING.md`.                                                                                                                                             |
| D4  | Drop the `openai` and `tiktoken` dependencies. Keep the context-window table and the character approximation used for prompt trimming.                                                                                             | Keeping tiktoken: it is only used by `countTokens`, which nothing in the repo calls, and it ships a WASM blob.                                                                                                                                                                          |
| D5  | `ai` and `@ai-sdk/openai` are ESM-only. Our CommonJS output loads them through `require(esm)`, which needs Node 22.12 or newer; we already require that.                                                                           | Converting every package to ESM first. That is the separate gap recorded in `CONTRIBUTING.md`.                                                                                                                                                                                          |

## Requirements

- **R1.** `gen2e-llm` exports `runAgent(opts)`. It runs turns until one of these stop conditions:
  - the model answers without tool calls
  - a tool result sets `terminate`
  - `maxTurns` is reached
  - the abort signal fires
  - the model call throws
- **R2.** `runAgent` executes tool calls sequentially, in the order the model issued them.
  - Unknown tools, input that fails the schema, and exceptions thrown by `execute` all become error results that the model sees. They never escape the loop.
- **R3.** `runAgent` accepts `beforeToolCall`, which may block a call with a reason, and `prepareTurn`, which may change the model or append messages before each model call.
- **R4.** `runAgent` emits these events through `onEvent`:
  - `agent_start`, `agent_end`
  - `turn_start`, `turn_end`
  - `tool_start`, `tool_end`
- **R5.** `runAgent` returns:
  - the messages
  - the final text
  - the terminating tool result, if any
  - the summed usage (input, output and total tokens)
  - the turn count
  - the tool call count
  - the stop reason
- **R6.** `createCodeGenAgent` keeps its call signature and result type, and runs on `runAgent`:
  - Tools are `Gen2EAgentTool` values with zod input schemas.
  - The format and JS/JSON validation tools are rebuilt on that shape.
  - Fallback models and usage hooks keep working.
- **R7.** `resolveModel` implements D2. A `LanguageModel` instance is used as is. Its id for cache keys and telemetry is `provider:modelId`.
- **R8.** A gen2e step runs one agent with a `run_expression` tool:
  - The tool rejects markdown and unparsable JavaScript without running it.
  - Otherwise it evaluates the expression on the page. Success terminates the run and the expression is cached.
  - A failure returns the error text. If the DOM moved, it also returns a fresh DOM snapshot.
  - The number of evaluations is capped by `policies.maxRetries`.
- **R9.** The cost ladder and the screenshot policy keep their behavior, now through `prepareTurn`:
  - Before the first failed evaluation, the step uses the cheap model with the cheap screenshot policy.
  - After that, it uses the primary model and the configured policy.
  - Screenshots go in user messages, because chat-completions tool messages cannot carry images.
- **R10.** The step telemetry keeps its fields:
  - `attempts` is the number of evaluations, and `retries` is attempts minus one.
  - `toolCalls` is the total number of tool calls.
  - Token usage is summed across all turns.
- **R11.** The page-object agents and the interpreter run on R6. They keep their public APIs.
- **R12.** Tests drive the real loop with `MockLanguageModelV4` from `ai/test`. Module mocks for the model layer go away.

## Phases

1. **gen2e-llm** (R1–R7, R12): the model layer, `runAgent`, `createCodeGenAgent` on top of it, and tests. Remove the `openai` and `tiktoken` dependencies.
2. **gen2e** (R8–R10, R12): the step as an agent run. Rewrite `eval-loop.test.ts` and the generation parts of `gen.test.ts` against the mock model.
3. **po and interpreter** (R11): move their tools to `Gen2EAgentTool`.
4. **Docs**: model and provider configuration, the agent loop, and the README.

## Acceptance checks

- `bun run gate` passes after each phase.
- In the step tests, a scripted model answers with:
  1. a failing `run_expression`
  2. then a passing one

  The test asserts:
  - the step succeeds
  - the cache holds the second expression
  - `attempts` is 2
  - the second model call saw the error text
- A ladder test shows that the first model call used the cheap model and the second used the primary model.
- `bun run eval:replay` still passes against the seeded cache.
- Live model calls are not verified without an API key. The change says so.
