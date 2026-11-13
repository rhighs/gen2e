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

// Answers each step by the first route whose key appears in the prompt, so it works across processes and in any order.
export const routedModel = (routes: [string, string][], modelId = "scripted") =>
  new MockLanguageModelV4({
    modelId,
    doGenerate: async ({ prompt }) => {
      const text = JSON.stringify(prompt);
      const hit = routes.find(([k]) => text.includes(k));
      if (!hit) {
        throw new Error(`no scripted answer for this prompt: ${text.slice(0, 300)}`);
      }
      return toolTurn({ name: "run_expression", input: { code: hit[1] } });
    },
  });
