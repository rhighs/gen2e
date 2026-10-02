import {
  createCodeGenAgent,
  type Gen2ELLMAgentModel,
  type Gen2ELLMAgentResult,
  type Gen2ELLMCodeGenAgentTask,
} from "../../src";

const describeIntegration = process.env.OPENAI_API_KEY ? describe : describe.skip;

describeIntegration("createCodeGenAgent Integration Tests", () => {
  const systemMessage =
    "You are a code generator, expert in writing javascript code as per the task assigned. You must first validate your\
  code via the tools provided and then return that code as your final response. You only speak code so don't waste words into trying to explain what you're doing.";
  const model = "gpt-3.5-turbo" as Gen2ELLMAgentModel;
  const apiKey = process.env.OPENAI_API_KEY;

  test("should create a code generation agent and generate valid code", async () => {
    const agent = createCodeGenAgent(systemMessage, model, {
      openaiApiKey: apiKey,
      debug: true,
    });
    const task: Gen2ELLMCodeGenAgentTask = {
      task: "generate a simpl hello world",
      codeContext: undefined,
    };

    const result: Gen2ELLMAgentResult<string> = await agent(task, {
      onUsage: jest.fn(),
    });

    expect(result).toEqual({
      type: "success",
      result: expect.any(String),
    });
  }, 10000);
});
