import { createGen2ECodeGenAgent, generateGen2ECode } from "../../../src";
import { createCodeGenAgent, Gen2ELLMAgentModel } from "@rhighs/gen2e-llm";

jest.mock("@rhighs/gen2e-llm", () => ({
  createCodeGenAgent: jest.fn(),
}));

const mockAgent = jest.fn();
const mockCreateCodeGenAgent = createCodeGenAgent as jest.MockedFunction<
  typeof createCodeGenAgent
>;

describe("Gen2E Code Generation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateCodeGenAgent.mockReturnValue(mockAgent);
  });

  test("should create a Gen2E code generation agent", () => {
    const options = {
      openaiApiKey: "test-api-key",
      debug: false,
    };
    const defaultModel: Gen2ELLMAgentModel = "gpt-3.5-turbo";

    const agent = createGen2ECodeGenAgent(defaultModel, options);

    expect(mockCreateCodeGenAgent).toHaveBeenCalledWith(
      expect.any(String),
      defaultModel,
      {
        openaiApiKey: options.openaiApiKey,
        debug: options.debug,
      }
    );
    expect(agent).toBe(mockAgent);
  });

  test("should generate Gen2E code successfully", async () => {
    const task = "Generate a test script";
    const codeContext = "Test context";
    const hooks = {};
    const expectedCode = 'const testCode = "Generated Code";';

    mockAgent.mockResolvedValue({ type: "success", result: expectedCode });

    const result = await generateGen2ECode({
      agent: mockAgent,
      task,
      codeContext,
      options: { model: "gpt-3.5-turbo", debug: false },
      hooks,
    });

    expect(result).toEqual({
      type: "success",
      result: expectedCode,
    });
    expect(mockAgent).toHaveBeenCalledWith(
      {
        task,
        codeContext,
        options: { model: "gpt-3.5-turbo", debug: false },
      },
      hooks
    );
  });

  test("should handle code generation errors", async () => {
    const task = "Generate a test script";
    const codeContext = "Test context";
    const hooks = {};
    const errorMessage = "An error occurred";

    mockAgent.mockResolvedValue({ type: "error", errorMessage });

    const result = await generateGen2ECode({
      agent: mockAgent,
      task,
      codeContext,
      options: { model: "gpt-3.5-turbo", debug: false },
      hooks,
    });

    expect(result).toEqual({
      type: "error",
      errorMessage,
    });
    expect(mockAgent).toHaveBeenCalledWith(
      {
        task,
        codeContext,
        options: { model: "gpt-3.5-turbo", debug: false },
      },
      hooks
    );
  });
});
