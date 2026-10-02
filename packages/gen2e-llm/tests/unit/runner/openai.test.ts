import {
  fitsContext,
  type Gen2ELLMAgentRunnerInit,
  Gen2EOpenAIRunner,
  type Gen2EOpenAIRunnerOptions,
  maxCharactersApprox,
} from "../../../src";

const mockDebug = jest.fn();

jest.mock("@rhighs/gen2e-logger", () => ({
  makeLogger: () => ({
    config: jest.fn(),
    fmt: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: (...args: unknown[]) => mockDebug(...args),
  }),
}));

jest.mock("../../../src/runner/openai-token");

const makeOpenAIMock = () => {
  const runnerMock = {
    on: jest.fn().mockReturnThis(),
    finalContent: jest.fn().mockResolvedValue("final result"),
    totalUsage: jest.fn().mockResolvedValue({
      completion_tokens: 10,
      prompt_tokens: 5,
      total_tokens: 15,
    }),
  };

  return {
    runnerMock,
    client: {
      beta: {
        chat: {
          completions: {
            runTools: jest.fn().mockReturnValue(runnerMock),
          },
        },
      },
    },
  };
};

describe("Gen2EOpenAIRunner", () => {
  const apiKey = "test-api-key";
  let client: ReturnType<typeof makeOpenAIMock>["client"];
  let runner: Gen2EOpenAIRunner;

  beforeEach(() => {
    (fitsContext as jest.Mock).mockReturnValue(true);
    (maxCharactersApprox as jest.Mock).mockReturnValue(100);
    client = makeOpenAIMock().client;

    const options: Gen2EOpenAIRunnerOptions = {
      apiKey,
      model: "test-model",
      debug: true,
      openai: client as unknown as Gen2EOpenAIRunnerOptions["openai"],
    };
    runner = new Gen2EOpenAIRunner(options);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("should initialize with correct options", () => {
    expect(runner).toBeInstanceOf(Gen2EOpenAIRunner);
  });

  test("should adjust context when it exceeds token limit", async () => {
    (fitsContext as jest.Mock).mockReturnValue(false);
    (maxCharactersApprox as jest.Mock).mockReturnValue(100);

    const init: Gen2ELLMAgentRunnerInit = {
      taskPrompt: "A".repeat(200),
      systemMessage: "System message",
      tools: [],
    };

    const result = await runner.run(init);

    expect(fitsContext).toHaveBeenCalled();
    expect(maxCharactersApprox).toHaveBeenCalled();
    expect(mockDebug).toHaveBeenCalled();
    expect(result.type).toBe("success");

    // The system message must not leak into the user content.
    const messages = client.beta.chat.completions.runTools.mock.calls[0][0].messages as Array<{
      role: string;
      content: unknown;
    }>;
    expect(String(messages[1].content)).not.toContain("System message");
  });

  test("should run tools and return success result", async () => {
    const init: Gen2ELLMAgentRunnerInit = {
      taskPrompt: "task",
      systemMessage: "system",
      tools: [],
    };

    const result = await runner.run(init);

    expect(result).toEqual({ type: "success", result: "final result" });
    expect(await runner.getUsage()).toEqual({
      completionTokens: 10,
      promptTokens: 5,
      totalTokens: 15,
    });
  });

  test("should attach images to the user content for vision models", async () => {
    const visionRunner = new Gen2EOpenAIRunner({
      apiKey,
      model: "gpt-4o",
      openai: client as unknown as Gen2EOpenAIRunnerOptions["openai"],
    });

    await visionRunner.run({
      taskPrompt: "task",
      systemMessage: "system",
      images: [Buffer.from("fake-image")],
      tools: [],
    });

    const messages = client.beta.chat.completions.runTools.mock.calls[0][0].messages as Array<{
      content: Array<{ type: string }>;
    }>;
    expect(messages[1].content).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "image_url" })]),
    );
  });

  test("should reject images for models without vision support", async () => {
    const result = await runner.run({
      taskPrompt: "task",
      systemMessage: "system",
      images: [Buffer.from("fake-image")],
      tools: [],
    });

    expect(result).toEqual({
      type: "error",
      reason: "model does not supporting feeding images",
    });
  });

  test("should return error result on failure", async () => {
    const failing = makeOpenAIMock();
    failing.runnerMock.finalContent.mockRejectedValueOnce(new Error("test error"));
    client.beta.chat.completions.runTools.mockReturnValueOnce(failing.runnerMock);

    const init: Gen2ELLMAgentRunnerInit = {
      taskPrompt: "task",
      systemMessage: "system",
      tools: [],
    };

    const result = await runner.run(init);

    expect(result).toEqual({
      type: "error",
      reason: "got error test error",
    });
  });

  test("should update usage statistics", async () => {
    const usage = {
      completion_tokens: 10,
      prompt_tokens: 5,
      total_tokens: 15,
    };

    (runner as unknown as { updateUsage: (u: unknown) => void }).updateUsage(usage);

    expect(await runner.getUsage()).toEqual({
      completionTokens: 10,
      promptTokens: 5,
      totalTokens: 15,
    });
  });
});
