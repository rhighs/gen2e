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
  test("isModelSupported accepts non-empty ids and model instances", () => {
    expect(isModelSupported("openai/gpt-5.4")).toBe(true);
    expect(isModelSupported(scriptedModel([]))).toBe(true);
    expect(isModelSupported("   ")).toBe(false);
    expect(isModelSupported(42)).toBe(false);
  });

  test("modelId", () => {
    expect(modelId("my-model")).toBe("my-model");
    expect(modelId(scriptedModel([], "m"))).toBe("mock-provider:m");
  });

  test("resolveModel uses the Responses API for OpenAI and Chat Completions for a custom base URL", () => {
    const baseURL = process.env.OPENAI_BASE_URL;
    delete process.env.OPENAI_BASE_URL;
    try {
      expect(resolveModel("gpt-4o-mini", { apiKey: "k" }).provider).toBe("openai.responses");
    } finally {
      if (baseURL !== undefined) {
        process.env.OPENAI_BASE_URL = baseURL;
      }
    }
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

  test.each([
    "429 Too Many Requests",
    "rate limit exceeded",
    "service unavailable 503",
    "model overloaded",
    "insufficient capacity",
    "request timeout",
    "connect ETIMEDOUT",
    "read ECONNRESET",
  ])("%p is retryable", (reason) => {
    expect(isRetryableModelError(reason)).toBe(true);
  });

  test.each(["invalid api key", "model does not support images", ""])(
    "%p is not retryable",
    (reason) => {
      expect(isRetryableModelError(reason)).toBe(false);
    },
  );
});
