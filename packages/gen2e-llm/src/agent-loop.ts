import {
  generateText,
  type LanguageModelUsage,
  type ModelMessage,
  type ToolResultPart,
  type ToolSet,
  tool,
} from "ai";
import type { Gen2ELanguageModel } from "./model";
import type { Gen2EAgentTool, Gen2EAgentToolResult } from "./tool";

export type Gen2EAgentUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type Gen2EAgentStopReason = "done" | "terminated" | "max_turns" | "aborted" | "error";

export type Gen2EAgentToolCall = {
  turn: number;
  toolCallId: string;
  toolName: string;
  input: unknown;
};

export type Gen2EAgentRunResult = {
  stopReason: Gen2EAgentStopReason;
  text: string;
  terminal?: Gen2EAgentToolCall & { result: Gen2EAgentToolResult };
  messages: ModelMessage[];
  usage: Gen2EAgentUsage;
  turns: number;
  toolCalls: number;
  error?: unknown;
};

export type Gen2EAgentEvent =
  | { type: "agent_start" }
  | { type: "turn_start"; turn: number; model: Gen2ELanguageModel }
  | { type: "message"; turn: number; message: ModelMessage }
  | { type: "turn_end"; turn: number; text: string; toolCalls: number; usage: Gen2EAgentUsage }
  | ({ type: "tool_start" } & Gen2EAgentToolCall)
  | ({ type: "tool_end"; result: Gen2EAgentToolResult } & Gen2EAgentToolCall)
  | { type: "agent_end"; result: Gen2EAgentRunResult };

export type Gen2EAgentTurnPlan = {
  model?: Gen2ELanguageModel;
  messages?: ModelMessage[];
};

export type Gen2EAgentRunOptions = {
  model: Gen2ELanguageModel;
  instructions: string;
  messages: ModelMessage[];
  tools?: Gen2EAgentTool[];
  maxTurns?: number;
  temperature?: number;
  maxRetries?: number;
  toolChoice?: "auto" | "required";
  signal?: AbortSignal;
  prepareTurn?: (state: {
    turn: number;
    messages: readonly ModelMessage[];
  }) => Promise<Gen2EAgentTurnPlan | undefined> | Gen2EAgentTurnPlan | undefined;
  beforeToolCall?: (
    call: Gen2EAgentToolCall,
  ) => Promise<Gen2EAgentToolResult | undefined> | Gen2EAgentToolResult | undefined;
  onEvent?: (event: Gen2EAgentEvent) => Promise<void> | void;
};

const DEFAULT_MAX_TURNS = 10;

const toUsage = (u: LanguageModelUsage): Gen2EAgentUsage => ({
  inputTokens: u.inputTokens ?? 0,
  outputTokens: u.outputTokens ?? 0,
  totalTokens: u.totalTokens ?? (u.inputTokens ?? 0) + (u.outputTokens ?? 0),
});

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

const toToolSet = (tools: Gen2EAgentTool[]): ToolSet =>
  Object.fromEntries(
    tools.map((t) => [t.name, tool({ description: t.description, inputSchema: t.inputSchema })]),
  );

const answeredCallIds = (messages: readonly ModelMessage[]): Set<string> => {
  const ids = new Set<string>();
  for (const m of messages) {
    if (m.role !== "tool") {
      continue;
    }
    for (const part of m.content) {
      if (part.type === "tool-result") {
        ids.add(part.toolCallId);
      }
    }
  }
  return ids;
};

const resultPart = (call: Gen2EAgentToolCall, result: Gen2EAgentToolResult): ToolResultPart => ({
  type: "tool-result",
  toolCallId: call.toolCallId,
  toolName: call.toolName,
  output: result.isError
    ? { type: "error-text", value: result.output }
    : { type: "text", value: result.output },
});

export const runAgent = async (opts: Gen2EAgentRunOptions): Promise<Gen2EAgentRunResult> => {
  const tools = opts.tools ?? [];
  const byName = new Map(tools.map((t) => [t.name, t]));
  const toolSet = toToolSet(tools);
  const maxTurns = opts.maxTurns ?? DEFAULT_MAX_TURNS;
  const messages: ModelMessage[] = [...opts.messages];
  const usage: Gen2EAgentUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  const emit = async (event: Gen2EAgentEvent) => {
    await opts.onEvent?.(event);
  };

  let turns = 0;
  let toolCalls = 0;
  let text = "";
  let terminal: Gen2EAgentRunResult["terminal"];

  const finish = async (
    stopReason: Gen2EAgentStopReason,
    error?: unknown,
  ): Promise<Gen2EAgentRunResult> => {
    const result: Gen2EAgentRunResult = {
      stopReason,
      text,
      terminal,
      messages,
      usage,
      turns,
      toolCalls,
      error,
    };
    await emit({ type: "agent_end", result });
    return result;
  };

  const push = async (turn: number, message: ModelMessage) => {
    messages.push(message);
    await emit({ type: "message", turn, message });
  };

  const executeCall = async (call: Gen2EAgentToolCall): Promise<Gen2EAgentToolResult> => {
    const t = byName.get(call.toolName);
    if (!t) {
      return { output: `unknown tool "${call.toolName}"`, isError: true };
    }

    try {
      const blocked = await opts.beforeToolCall?.(call);
      if (blocked) {
        return blocked;
      }
      return await t.execute(call.input, { signal: opts.signal });
    } catch (err) {
      return { output: errorText(err), isError: true };
    }
  };

  await emit({ type: "agent_start" });

  while (true) {
    if (opts.signal?.aborted) {
      return finish("aborted");
    }
    if (turns >= maxTurns) {
      return finish("max_turns");
    }

    const turn = turns;
    const plan = await opts.prepareTurn?.({ turn, messages });
    for (const m of plan?.messages ?? []) {
      await push(turn, m);
    }
    const model = plan?.model ?? opts.model;

    turns++;
    await emit({ type: "turn_start", turn, model });

    let res: Awaited<ReturnType<typeof generateText>>;
    try {
      res = await generateText({
        model,
        instructions: opts.instructions,
        messages,
        tools: toolSet,
        toolChoice: opts.toolChoice,
        temperature: opts.temperature,
        maxRetries: opts.maxRetries,
        abortSignal: opts.signal,
      });
    } catch (err) {
      return finish(opts.signal?.aborted ? "aborted" : "error", err);
    }

    const turnUsage = toUsage(res.usage);
    usage.inputTokens += turnUsage.inputTokens;
    usage.outputTokens += turnUsage.outputTokens;
    usage.totalTokens += turnUsage.totalTokens;
    text = res.text;

    for (const m of res.responseMessages) {
      await push(turn, m);
    }
    await emit({
      type: "turn_end",
      turn,
      text,
      toolCalls: res.toolCalls.length,
      usage: turnUsage,
    });

    if (res.toolCalls.length === 0) {
      return finish("done");
    }

    const answered = answeredCallIds(res.responseMessages);
    const parts: ToolResultPart[] = [];
    for (const c of res.toolCalls) {
      const call: Gen2EAgentToolCall = {
        turn,
        toolCallId: c.toolCallId,
        toolName: c.toolName,
        input: c.input,
      };
      toolCalls++;
      await emit({ type: "tool_start", ...call });

      let result: Gen2EAgentToolResult;
      if (terminal) {
        result = { output: "skipped: the run already finished", isError: true };
      } else if (c.dynamic && c.invalid) {
        result = { output: `invalid tool call: ${errorText(c.error)}`, isError: true };
      } else {
        result = await executeCall(call);
      }

      await emit({ type: "tool_end", ...call, result });
      if (!answered.has(call.toolCallId)) {
        parts.push(resultPart(call, result));
      }
      if (result.terminate && !terminal) {
        terminal = { ...call, result };
      }
    }

    if (parts.length > 0) {
      await push(turn, { role: "tool", content: parts });
    }
    if (terminal) {
      return finish("terminated");
    }
  }
};
