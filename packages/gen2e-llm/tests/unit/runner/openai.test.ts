import {
  Gen2EOpenAIRunner,
  Gen2EOpenAIRunnerOptions,
  Gen2ELLMAgentRunnerInit,
  fitsContext,
  maxCharactersApprox,
  Gen2ELLMAgentOpenAIModel,
} from "../../../src";
import { debug } from "../../../src/log";

jest.mock("../../../src/runner/openai-token");
jest.mock("../../../src/log");

describe("Gen2EOpenAIRunner", () => {
  const apiKey = "test-api-key";
  const model = "test-model" as Gen2ELLMAgentOpenAIModel;
  let mockOpenAI: any;
  let runner: Gen2EOpenAIRunner;

  beforeEach(() => {
    mockOpenAI = {
      beta: {
        chat: {
          completions: {
            runTools: jest.fn().mockReturnValue({
              finalContent: jest.fn().mockResolvedValue("final result"),
              totalUsage: jest.fn().mockResolvedValue({
                completion_tokens: 10,
                prompt_tokens: 5,
                total_tokens: 15,
              }),
            }),
          },
        },
      },
    };

    const options: Gen2EOpenAIRunnerOptions = {
      apiKey,
      model,
      debug: true,
      openai: mockOpenAI,
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

    await runner.run(init);

    expect(fitsContext).toHaveBeenCalled();
    expect(maxCharactersApprox).toHaveBeenCalled();
    expect(debug).toHaveBeenCalled();
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

  test("should return error result on failure", async () => {
    mockOpenAI.beta.chat.completions.runTools.mockReturnValueOnce({
      finalContent: jest.fn().mockRejectedValue(new Error("test error")),
      totalUsage: jest.fn().mockResolvedValue({
        completion_tokens: 10,
        prompt_tokens: 5,
        total_tokens: 15,
      }),
    });

    const init: Gen2ELLMAgentRunnerInit = {
      taskPrompt: "task",
      systemMessage: "system",
      tools: [],
    };

    const result = await runner.run(init);

    expect(result).toEqual({
      type: "error",
      reason: "got error Error: test error",
    });
  });

  test("should update usage statistics", async () => {
    const usage = {
      completion_tokens: 10,
      prompt_tokens: 5,
      total_tokens: 15,
    };

    (runner as any).updateUsage(usage);

    expect(await runner.getUsage()).toEqual({
      completionTokens: 10,
      promptTokens: 5,
      totalTokens: 15,
    });
  });
});
