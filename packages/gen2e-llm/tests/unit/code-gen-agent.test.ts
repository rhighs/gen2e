import { createCodeGenAgent, type Gen2ELLMAgentModel, Gen2ELLMGenericError } from "../../src";

const mockGenerateText = jest.fn();
const mockGateway = jest.fn((id: string) => ({
  provider: "gateway",
  modelId: id,
  specificationVersion: "v3",
}));
const mockCreateGateway = jest.fn((_settings?: unknown) => (id: string) => ({
  provider: "gateway",
  modelId: id,
  specificationVersion: "v3",
}));

jest.mock("ai", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  gateway: (id: string) => mockGateway(id),
  createGateway: (settings: unknown) => mockCreateGateway(settings),
  tool: (definition: unknown) => definition,
  jsonSchema: (schema: unknown) => ({ jsonSchema: schema }),
  stepCountIs: (count: number) => count,
}));

const lastGenerateTextArgs = () =>
  mockGenerateText.mock.calls.at(-1)?.[0] as {
    model: { modelId?: string };
  };

describe("createCodeGenAgent model gateways", () => {
  beforeEach(() => {
    mockGenerateText.mockResolvedValue({
      text: "let x = 1;",
      totalUsage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
      steps: [],
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("uses the AI SDK runner for provider/model gateway ids", async () => {
    const agent = createCodeGenAgent("system", "openai/gpt-5.4");
    const result = await agent({ task: "generate code" });

    expect(mockGateway).toHaveBeenCalledWith("openai/gpt-5.4");
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.objectContaining({ modelId: "openai/gpt-5.4" }),
      }),
    );
    expect(result).toEqual({ type: "success", result: "let x = 1;" });
  });

  test("uses an explicit AI Gateway key when provided", async () => {
    const agent = createCodeGenAgent("system", "openai/gpt-5.4", {
      gatewayApiKey: "gw-key",
    });
    await agent({ task: "generate code" });

    expect(mockCreateGateway).toHaveBeenCalledWith({ apiKey: "gw-key" });
  });

  test("switches models per task through task options", async () => {
    const agent = createCodeGenAgent("system", "openai/gpt-5.4");
    await agent({
      task: "generate code",
      options: { model: "anthropic/claude-sonnet-4.6" },
    });

    expect(mockGateway).toHaveBeenCalledWith("anthropic/claude-sonnet-4.6");
    expect(lastGenerateTextArgs().model.modelId).toBe("anthropic/claude-sonnet-4.6");
  });

  test("accepts AI SDK language model instances", async () => {
    const customModel = {
      provider: "custom",
      modelId: "local-llm",
      specificationVersion: "v3",
    };
    const agent = createCodeGenAgent("system", customModel);
    await agent({ task: "generate code" });

    expect(lastGenerateTextArgs().model).toBe(customModel);
  });

  test("rejects unsupported model ids", () => {
    expect(() => createCodeGenAgent("system", "not-a-real-model" as Gen2ELLMAgentModel)).toThrow(
      Gen2ELLMGenericError,
    );
  });

  test("throws when an OpenAI model is used without an API key", () => {
    const previous = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      expect(() => createCodeGenAgent("system", "gpt-4o-mini")).toThrow(Gen2ELLMGenericError);
    } finally {
      if (previous !== undefined) {
        process.env.OPENAI_API_KEY = previous;
      }
    }
  });
});
