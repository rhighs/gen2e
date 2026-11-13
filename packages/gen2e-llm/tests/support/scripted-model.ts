import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { MockLanguageModelV4 } from "ai/test";

let callSeq = 0;

const usage = (input: number, output: number): LanguageModelV4GenerateResult["usage"] => ({
  inputTokens: { total: input, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: output, text: undefined, reasoning: undefined },
});

export const toolTurn = (
  ...calls: { name: string; input: unknown }[]
): LanguageModelV4GenerateResult => ({
  content: calls.map((c) => ({
    type: "tool-call",
    toolCallId: `call-${++callSeq}`,
    toolName: c.name,
    input: JSON.stringify(c.input),
  })),
  finishReason: { unified: "tool-calls", raw: undefined },
  usage: usage(10, 5),
  warnings: [],
});

export const textTurn = (text: string): LanguageModelV4GenerateResult => ({
  content: [{ type: "text", text }],
  finishReason: { unified: "stop", raw: undefined },
  usage: usage(10, 5),
  warnings: [],
});

export const scriptedModel = (turns: LanguageModelV4GenerateResult[], modelId = "scripted") =>
  new MockLanguageModelV4({ modelId, doGenerate: turns });

export const promptText = (model: MockLanguageModelV4, call: number): string =>
  JSON.stringify(model.doGenerateCalls[call]?.prompt ?? []);
