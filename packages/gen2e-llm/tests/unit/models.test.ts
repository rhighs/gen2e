import {
  isGatewayModel,
  isModelSupported,
  isOpenAIModel,
  isProviderModel,
  modelId,
  modelKey,
  modelSupportsImage,
} from "../../src";

describe("model helpers", () => {
  test("isOpenAIModel", () => {
    expect(isOpenAIModel("gpt-4o-mini")).toBe(true);
    expect(isOpenAIModel("gpt-5.4")).toBe(true);
    expect(isOpenAIModel("o3-mini")).toBe(true);
    expect(isOpenAIModel("openai/gpt-5.4")).toBe(false);
    expect(isOpenAIModel("claude-sonnet-4.6")).toBe(false);
  });

  test("isGatewayModel", () => {
    expect(isGatewayModel("openai/gpt-5.4")).toBe(true);
    expect(isGatewayModel("anthropic/claude-sonnet-4.6")).toBe(true);
    expect(isGatewayModel("gpt-4o")).toBe(false);
    expect(isGatewayModel("a/b/c")).toBe(false);
  });

  test("isProviderModel", () => {
    expect(isProviderModel({ provider: "gateway", modelId: "openai/gpt-5.4" })).toBe(true);
    expect(isProviderModel("gpt-4o")).toBe(false);
    expect(isProviderModel(null)).toBe(false);
    expect(isProviderModel({ provider: "gateway" })).toBe(false);
  });

  test("isModelSupported", () => {
    expect(isModelSupported("gpt-4o-mini")).toBe(true);
    expect(isModelSupported("openai/gpt-5.4")).toBe(true);
    expect(isModelSupported({ provider: "gateway", modelId: "x" })).toBe(true);
    expect(isModelSupported("not-a-model")).toBe(false);
    expect(isModelSupported(undefined)).toBe(false);
  });

  test("modelId and modelKey", () => {
    expect(modelId("openai/gpt-5.4")).toBe("openai/gpt-5.4");
    expect(modelId({ provider: "gateway", modelId: "openai/gpt-5.4" })).toBe("openai/gpt-5.4");
    expect(modelKey("openai/gpt-5.4")).toBe("openai/gpt-5.4");
    expect(modelKey({ provider: "gateway", modelId: "openai/gpt-5.4" })).toBe(
      "gateway::openai/gpt-5.4",
    );
  });

  test("modelSupportsImage", () => {
    expect(modelSupportsImage("gpt-4o")).toBe(true);
    expect(modelSupportsImage("gpt-3.5-turbo")).toBe(false);
    expect(modelSupportsImage("anthropic/claude-sonnet-4.6")).toBe(true);
    expect(modelSupportsImage("google/gemini-3.8-flash")).toBe(true);
    expect(modelSupportsImage("deepseek/deepseek-v4-pro")).toBe(false);
    expect(modelSupportsImage({ provider: "gateway", modelId: "x-vision-model" })).toBe(false);
  });
});
