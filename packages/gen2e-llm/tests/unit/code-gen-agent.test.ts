import { createCodeGenAgent, type Gen2ELLMAgentModel, Gen2ELLMGenericError } from "../../src";

const mockRunnerRun = jest.fn();
const mockRunnerGetUsage = jest.fn();
const mockRunnerOptions: Array<Record<string, unknown>> = [];

jest.mock("../../src/runner/openai", () => ({
  Gen2EOpenAIRunner: jest.fn().mockImplementation((options: Record<string, unknown>) => {
    mockRunnerOptions.push(options);
    return {
      run: (...args: unknown[]) => mockRunnerRun(...args),
      getUsage: (...args: unknown[]) => mockRunnerGetUsage(...args),
    };
  }),
}));

describe("createCodeGenAgent model handling", () => {
  beforeEach(() => {
    mockRunnerOptions.length = 0;
    mockRunnerRun.mockResolvedValue({ type: "success", result: "let x = 1;" });
    mockRunnerGetUsage.mockResolvedValue({
      completionTokens: 2,
      promptTokens: 3,
      totalTokens: 5,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("uses the OpenAI-compatible endpoint options and model id", async () => {
    const agent = createCodeGenAgent("system", "my-model", {
      openaiApiKey: "key",
      baseURL: "https://endpoint.internal/v1",
      promptVersion: "v1",
    });
    const result = await agent({ task: "generate code" });

    expect(mockRunnerOptions[0]).toEqual(
      expect.objectContaining({
        apiKey: "key",
        model: "my-model",
        baseURL: "https://endpoint.internal/v1",
      }),
    );
    expect(result).toEqual({ type: "success", result: "let x = 1;" });
  });

  test("reports usage with the model and prompt version", async () => {
    const onUsage = jest.fn();
    const agent = createCodeGenAgent("system", "my-model", {
      openaiApiKey: "key",
      promptVersion: "v1",
    });
    await agent({ task: "generate code" }, { onUsage });

    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "my-model",
        promptVersion: "v1",
        totalTokens: 5,
      }),
    );
  });

  test("creates a runner for a per-task model override", async () => {
    const agent = createCodeGenAgent("system", "my-model", { openaiApiKey: "key" });
    await agent({ task: "generate code", options: { model: "other-model" } });

    expect(mockRunnerOptions[1]).toEqual(expect.objectContaining({ model: "other-model" }));
  });

  test("returns an error when the runner fails", async () => {
    mockRunnerRun.mockResolvedValueOnce({ type: "error", reason: "boom" });
    const agent = createCodeGenAgent("system", "my-model", { openaiApiKey: "key" });

    const result = await agent({ task: "generate code" });

    expect(result.type).toBe("error");
    expect(result.type === "error" && result.errorMessage).toContain("boom");
  });

  test("throws when no API key is available", () => {
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

  test("rejects an empty model id", () => {
    expect(() =>
      createCodeGenAgent("system", "" as Gen2ELLMAgentModel, {
        openaiApiKey: "key",
      }),
    ).toThrow(Gen2ELLMGenericError);
  });
});
