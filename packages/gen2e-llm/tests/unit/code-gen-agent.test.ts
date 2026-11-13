import { describe, expect, jest, test } from "bun:test";
import { APICallError } from "ai";
import { createCodeGenAgent } from "../../src";
import { promptText, scriptedModel, textTurn, toolTurn } from "../support/scripted-model";

const retryable = () =>
  new APICallError({
    message: "rate limited",
    url: "https://example.test",
    requestBodyValues: {},
    statusCode: 429,
    isRetryable: true,
  });

describe("createCodeGenAgent", () => {
  test("returns the sanitized answer and reports usage", async () => {
    const model = scriptedModel([textTurn("```js\nawait page.click('#go')\n```")]);
    const onUsage = jest.fn();
    const agent = createCodeGenAgent("sys", model, { promptVersion: "v1" });

    const res = await agent({ task: "click go" }, { onUsage });

    expect(res).toEqual({ type: "success", result: "await page.click('#go')" });
    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "mock-provider:scripted",
        promptVersion: "v1",
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      }),
    );
  });

  test("lets the model check its code with the validation tools before answering", async () => {
    const model = scriptedModel([
      toolTurn({ name: "code_validation_tool", input: { code: "await (" } }),
      textTurn("await page.click('#go')"),
    ]);
    const agent = createCodeGenAgent("sys", model);

    const res = await agent({ task: "click go" });

    expect(res.type).toBe("success");
    expect(promptText(model, 1)).toContain("invalid javascript");
  });

  test("forwards conversation messages to onMessage", async () => {
    const model = scriptedModel([textTurn("await page.click('#go')")]);
    const onMessage = jest.fn();

    await createCodeGenAgent("sys", model)({ task: "click go" }, { onMessage });

    expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ role: "assistant" }));
  });

  test("sends task images to the model", async () => {
    const model = scriptedModel([textTurn("await page.click('#go')")]);

    await createCodeGenAgent("sys", model)({ task: "click go", images: [Buffer.from("jpeg")] });

    expect(promptText(model, 0)).toContain("image/jpeg");
  });

  test("uses a per-task model override", async () => {
    const primary = scriptedModel([textTurn("never")], "primary");
    const override = scriptedModel([textTurn("await page.click('#go')")], "override");

    const res = await createCodeGenAgent(
      "sys",
      primary,
    )({
      task: "click go",
      options: { model: override },
    });

    expect(res.type).toBe("success");
    expect(primary.doGenerateCalls).toHaveLength(0);
  });

  test("falls back to the next model on a retryable error", async () => {
    const primary = scriptedModel([], "primary");
    primary.doGenerate = () => {
      throw retryable();
    };
    const fallback = scriptedModel([textTurn("await page.click('#go')")], "fallback");
    const onUsage = jest.fn();

    const res = await createCodeGenAgent("sys", primary, {
      fallbackModels: [fallback],
      retryBackoffMs: 0,
      maxRetries: 0,
    })({ task: "click go" }, { onUsage });

    expect(res.type).toBe("success");
    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({ model: "mock-provider:fallback" }),
    );
  });

  test("does not fall back on a non-retryable error", async () => {
    const primary = scriptedModel([], "primary");
    primary.doGenerate = () => {
      throw new Error("invalid api key");
    };
    const fallback = scriptedModel([textTurn("never")], "fallback");

    const res = await createCodeGenAgent("sys", primary, {
      fallbackModels: [fallback],
      retryBackoffMs: 0,
      maxRetries: 0,
    })({ task: "click go" });

    expect(res.type).toBe("error");
    expect(fallback.doGenerateCalls).toHaveLength(0);
  });

  test("fails when the answer is not valid javascript", async () => {
    const model = scriptedModel([textTurn("await page.click(")]);

    const res = await createCodeGenAgent("sys", model)({ task: "click go" });

    expect(res.type).toBe("error");
  });

  test("throws at creation when a model id has no API key", () => {
    const key = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      expect(() => createCodeGenAgent("sys", "gpt-4o-mini")).toThrow("no API key");
    } finally {
      if (key !== undefined) {
        process.env.OPENAI_API_KEY = key;
      }
    }
  });

  test("rejects an empty model id", () => {
    expect(() => createCodeGenAgent("sys", "", { openaiApiKey: "k" })).toThrow("unsupported model");
  });
});
