import { describe, expect, test } from "bun:test";
import { APICallError } from "ai";
import {
  isModelSupported,
  isRetryableError,
  isRetryableModelError,
  modelId,
  modelSupportsImage,
  resolveModel,
} from "../../src";
import { scriptedModel } from "../support/scripted-model";

describe("model helpers", () => {
  test("isModelSupported accepts any non-empty model id", () => {
    expect(isModelSupported("gpt-4o-mini")).toBe(true);
    expect(isModelSupported("my-finetune-7b")).toBe(true);
    expect(isModelSupported("openai/gpt-5.4")).toBe(true);
    expect(isModelSupported("")).toBe(false);
    expect(isModelSupported("   ")).toBe(false);
    expect(isModelSupported(undefined)).toBe(false);
    expect(isModelSupported(42)).toBe(false);
  });

  test("isModelSupported accepts an AI SDK model instance", () => {
    expect(isModelSupported(scriptedModel([]))).toBe(true);
  });

  test("modelId", () => {
    expect(modelId("my-model")).toBe("my-model");
    expect(modelId(scriptedModel([], "m"))).toBe("mock-provider:m");
  });

  test("resolveModel uses the Responses API for OpenAI and Chat Completions for a custom base URL", () => {
    expect(resolveModel("gpt-4o-mini", { apiKey: "k" }).provider).toBe("openai.responses");
    expect(
      resolveModel("my-model", { apiKey: "k", baseURL: "http://localhost:1/v1" }).provider,
    ).toBe("openai.chat");
  });

  test("resolveModel passes a model instance through", () => {
    const m = scriptedModel([]);
    expect(resolveModel(m)).toBe(m);
  });

  test("isRetryableError trusts APICallError.isRetryable", () => {
    const err = (isRetryable: boolean) =>
      new APICallError({ message: "x", url: "u", requestBodyValues: {}, isRetryable });
    expect(isRetryableError(err(true))).toBe(true);
    expect(isRetryableError(err(false))).toBe(false);
    expect(isRetryableError(new Error("503 service unavailable"))).toBe(true);
  });

  test("modelSupportsImage", () => {
    expect(modelSupportsImage("gpt-4o")).toBe(true);
    expect(modelSupportsImage("gpt-3.5-turbo")).toBe(false);
    expect(modelSupportsImage("claude-sonnet-4.6")).toBe(true);
    expect(modelSupportsImage("gemini-3.8-flash")).toBe(true);
    expect(modelSupportsImage("deepseek-v4-pro")).toBe(false);
  });

  test("isRetryableModelError", () => {
    expect(isRetryableModelError("429 Too Many Requests")).toBe(true);
    expect(isRetryableModelError("rate limit exceeded")).toBe(true);
    expect(isRetryableModelError("too many requests, slow down")).toBe(true);
    expect(isRetryableModelError("service unavailable 503")).toBe(true);
    expect(isRetryableModelError("internal server error 500")).toBe(true);
    expect(isRetryableModelError("model overloaded")).toBe(true);
    expect(isRetryableModelError("insufficient capacity")).toBe(true);
    expect(isRetryableModelError("request timeout")).toBe(true);
    expect(isRetryableModelError("connect ETIMEDOUT")).toBe(true);
    expect(isRetryableModelError("read ECONNRESET")).toBe(true);

    expect(isRetryableModelError("invalid api key")).toBe(false);
    expect(isRetryableModelError("model does not supporting feeding images")).toBe(false);
    expect(isRetryableModelError("")).toBe(false);
  });
});
