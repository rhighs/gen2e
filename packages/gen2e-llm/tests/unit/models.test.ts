import { isModelSupported, isRetryableModelError, modelId, modelSupportsImage } from "../../src";

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

  test("modelId", () => {
    expect(modelId("my-model")).toBe("my-model");
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
