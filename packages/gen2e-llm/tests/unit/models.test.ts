import { isModelSupported, modelId, modelSupportsImage } from "../../src";

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
});
