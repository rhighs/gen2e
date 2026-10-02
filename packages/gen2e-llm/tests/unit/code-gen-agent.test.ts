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

  test("falls back to the next model on a retryable error", async () => {
    mockRunnerRun
      .mockResolvedValueOnce({ type: "error", reason: "429 rate limit exceeded" })
      .mockResolvedValueOnce({ type: "success", result: "let y = 2;" });
    const onUsage = jest.fn();
    const agent = createCodeGenAgent("system", "model-a", {
      openaiApiKey: "key",
      promptVersion: "v1",
      fallbackModels: ["model-b"],
      retryBackoffMs: 0,
    });

    const result = await agent({ task: "generate code" }, { onUsage });

    expect(result).toEqual({ type: "success", result: "let y = 2;" });
    expect(mockRunnerRun).toHaveBeenCalledTimes(2);
    expect(mockRunnerOptions.map((options) => options.model)).toEqual(["model-a", "model-b"]);
    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({ model: "model-b", promptVersion: "v1" }),
    );
  });

  test("does not fall back on a non-retryable error", async () => {
    mockRunnerRun.mockResolvedValueOnce({ type: "error", reason: "invalid api key" });
    const agent = createCodeGenAgent("system", "model-a", {
      openaiApiKey: "key",
      fallbackModels: ["model-b"],
      retryBackoffMs: 0,
    });

    const result = await agent({ task: "generate code" });

    expect(result.type).toBe("error");
    expect(mockRunnerRun).toHaveBeenCalledTimes(1);
    expect(mockRunnerOptions.map((options) => options.model)).toEqual(["model-a"]);
  });

  test("respects maxFallbacks", async () => {
    mockRunnerRun.mockResolvedValue({ type: "error", reason: "service unavailable 503" });
    const agent = createCodeGenAgent("system", "model-a", {
      openaiApiKey: "key",
      fallbackModels: ["model-b", "model-c", "model-d"],
      maxFallbacks: 1,
      retryBackoffMs: 0,
    });

    const result = await agent({ task: "generate code" });

    expect(result.type).toBe("error");
    expect(mockRunnerRun).toHaveBeenCalledTimes(2);
    expect(mockRunnerOptions.map((options) => options.model)).toEqual(["model-a", "model-b"]);
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
