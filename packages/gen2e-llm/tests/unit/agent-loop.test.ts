import { describe, expect, jest, test } from "bun:test";
import { z } from "zod";
import { defineTool, type Gen2EAgentEvent, runAgent } from "../../src";
import { promptText, scriptedModel, textTurn, toolTurn } from "../support/scripted-model";

const echo = defineTool({
  name: "echo",
  description: "echoes its input",
  inputSchema: z.object({ value: z.string() }),
  execute: ({ value }) => ({ output: `echo:${value}` }),
});

const user = (text: string) => [{ role: "user" as const, content: text }];

describe("runAgent", () => {
  test("executes a tool call, feeds the result back and stops on a plain answer", async () => {
    const model = scriptedModel([
      toolTurn({ name: "echo", input: { value: "hi" } }),
      textTurn("done"),
    ]);

    const res = await runAgent({ model, instructions: "sys", messages: user("go"), tools: [echo] });

    expect(res.stopReason).toBe("done");
    expect(res.text).toBe("done");
    expect(res.turns).toBe(2);
    expect(res.toolCalls).toBe(1);
    expect(res.usage).toEqual({ inputTokens: 20, outputTokens: 10, totalTokens: 30 });
    expect(promptText(model, 1)).toContain("echo:hi");
  });

  test("returns a thrown tool error to the model instead of failing the run", async () => {
    const boom = defineTool({
      name: "boom",
      description: "always throws",
      inputSchema: z.object({}),
      execute: () => {
        throw new Error("kaput");
      },
    });
    const model = scriptedModel([toolTurn({ name: "boom", input: {} }), textTurn("recovered")]);

    const res = await runAgent({ model, instructions: "sys", messages: user("go"), tools: [boom] });

    expect(res.stopReason).toBe("done");
    expect(promptText(model, 1)).toContain("kaput");
  });

  test("answers input that fails the schema with an error result", async () => {
    const model = scriptedModel([toolTurn({ name: "echo", input: { value: 42 } }), textTurn("ok")]);

    const res = await runAgent({ model, instructions: "sys", messages: user("go"), tools: [echo] });

    expect(res.stopReason).toBe("done");
    expect(promptText(model, 1)).toContain("Invalid input for tool echo");
  });

  test("answers a call to an unknown tool with an error result", async () => {
    const model = scriptedModel([toolTurn({ name: "nope", input: {} }), textTurn("ok")]);

    const res = await runAgent({ model, instructions: "sys", messages: user("go"), tools: [echo] });

    expect(res.stopReason).toBe("done");
    expect(res.toolCalls).toBe(1);
    expect(promptText(model, 1)).toContain("unavailable tool");
  });

  test("stops when a tool result terminates and skips the rest of the batch", async () => {
    const execute = jest.fn(({ value }: { value: string }) => ({ output: value, terminate: true }));
    const accept = defineTool({
      name: "accept",
      description: "accepts",
      inputSchema: z.object({ value: z.string() }),
      execute,
    });
    const model = scriptedModel([
      toolTurn(
        { name: "accept", input: { value: "a" } },
        { name: "accept", input: { value: "b" } },
      ),
      textTurn("unreachable"),
    ]);

    const res = await runAgent({
      model,
      instructions: "sys",
      messages: user("go"),
      tools: [accept],
    });

    expect(res.stopReason).toBe("terminated");
    expect(res.terminal?.input).toEqual({ value: "a" });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  test("stops at maxTurns", async () => {
    const model = scriptedModel([
      toolTurn({ name: "echo", input: { value: "1" } }),
      toolTurn({ name: "echo", input: { value: "2" } }),
      toolTurn({ name: "echo", input: { value: "3" } }),
    ]);

    const res = await runAgent({
      model,
      instructions: "sys",
      messages: user("go"),
      tools: [echo],
      maxTurns: 2,
    });

    expect(res.stopReason).toBe("max_turns");
    expect(res.turns).toBe(2);
  });

  test("lets beforeToolCall block a call without executing it", async () => {
    const execute = jest.fn(() => ({ output: "ran" }));
    const guarded = defineTool({
      name: "guarded",
      description: "guarded",
      inputSchema: z.object({}),
      execute,
    });
    const model = scriptedModel([toolTurn({ name: "guarded", input: {} }), textTurn("ok")]);

    await runAgent({
      model,
      instructions: "sys",
      messages: user("go"),
      tools: [guarded],
      beforeToolCall: () => ({ output: "blocked by policy", isError: true }),
    });

    expect(execute).not.toHaveBeenCalled();
    expect(promptText(model, 1)).toContain("blocked by policy");
  });

  test("prepareTurn switches the model and appends messages before a turn", async () => {
    const first = scriptedModel([toolTurn({ name: "echo", input: { value: "x" } })], "first");
    const second = scriptedModel([textTurn("done")], "second");

    const res = await runAgent({
      model: first,
      instructions: "sys",
      messages: user("go"),
      tools: [echo],
      prepareTurn: ({ turn }) =>
        turn === 1
          ? { model: second, messages: [{ role: "user", content: "fresh context" }] }
          : undefined,
    });

    expect(res.stopReason).toBe("done");
    expect(first.doGenerateCalls).toHaveLength(1);
    expect(second.doGenerateCalls).toHaveLength(1);
    expect(promptText(second, 0)).toContain("fresh context");
  });

  test("does not call the model when the signal is already aborted", async () => {
    const model = scriptedModel([textTurn("never")]);
    const ctrl = new AbortController();
    ctrl.abort();

    const res = await runAgent({
      model,
      instructions: "sys",
      messages: user("go"),
      signal: ctrl.signal,
    });

    expect(res.stopReason).toBe("aborted");
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  test("reports a model error as the stop reason", async () => {
    const model = scriptedModel([]);
    model.doGenerate = () => {
      throw new Error("provider down");
    };

    const res = await runAgent({ model, instructions: "sys", messages: user("go"), maxRetries: 0 });

    expect(res.stopReason).toBe("error");
    expect(String(res.error)).toContain("provider down");
  });

  test("emits events in order", async () => {
    const model = scriptedModel([
      toolTurn({ name: "echo", input: { value: "e" } }),
      textTurn("done"),
    ]);
    const events: Gen2EAgentEvent["type"][] = [];

    await runAgent({
      model,
      instructions: "sys",
      messages: user("go"),
      tools: [echo],
      onEvent: (e) => {
        events.push(e.type);
      },
    });

    expect(events).toEqual([
      "agent_start",
      "turn_start",
      "message",
      "turn_end",
      "tool_start",
      "tool_end",
      "message",
      "turn_start",
      "message",
      "turn_end",
      "agent_end",
    ]);
  });
});
