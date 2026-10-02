import {
  type Gen2ELLMAgentRunnerInit,
  type Gen2ELLMAgentTool,
  Gen2EVercelRunner,
} from "../../../src";

const mockGenerateText = jest.fn();
const mockTool = jest.fn((definition: unknown) => definition);
const mockJsonSchema = jest.fn((schema: unknown) => ({ jsonSchema: schema }));
const mockStepCountIs = jest.fn((count: number) => ({ count }));

jest.mock("ai", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  tool: (definition: unknown) => mockTool(definition),
  jsonSchema: (schema: unknown) => mockJsonSchema(schema),
  stepCountIs: (count: number) => mockStepCountIs(count),
}));

type GenerateTextArgs = {
  model: unknown;
  system: string;
  messages: Array<{ role: string; content: Array<Record<string, unknown>> }>;
  temperature: number;
  stopWhen: unknown;
  tools: Record<string, { execute: (args: unknown) => Promise<unknown> }>;
  headers?: Record<string, string>;
  onStepFinish?: (step: { text: string }) => void;
};

const runArgs = (): GenerateTextArgs => mockGenerateText.mock.calls[0][0] as GenerateTextArgs;

describe("Gen2EVercelRunner", () => {
  const model = "openai/gpt-5.4";

  beforeEach(() => {
    mockGenerateText.mockResolvedValue({
      text: "let x = 1;",
      totalUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      steps: [],
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("returns the final text and records usage", async () => {
    const runner = new Gen2EVercelRunner({ model });
    const init: Gen2ELLMAgentRunnerInit = {
      taskPrompt: "task",
      systemMessage: "system",
      tools: [],
    };

    const result = await runner.run(init);

    expect(result).toEqual({ type: "success", result: "let x = 1;" });
    expect(await runner.getUsage()).toEqual({
      completionTokens: 5,
      promptTokens: 10,
      totalTokens: 15,
    });
  });

  test("passes model, system message and stop condition to generateText", async () => {
    const runner = new Gen2EVercelRunner({ model, maxSteps: 4 });
    await runner.run({
      taskPrompt: "task",
      systemMessage: "system",
      tools: [],
    });

    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    expect(runArgs().model).toBe(model);
    expect(runArgs().system).toBe("system");
    expect(runArgs().temperature).toBeUndefined();
    expect(runArgs().stopWhen).toEqual({ count: 4 });
    expect(runArgs().messages[0].content[0]).toEqual({
      type: "text",
      text: "task",
    });
  });

  test("forwards an explicit temperature", async () => {
    const runner = new Gen2EVercelRunner({ model, temperature: 0 });
    await runner.run({
      taskPrompt: "task",
      systemMessage: "system",
      tools: [],
    });

    expect(runArgs().temperature).toBe(0);
  });

  test("attaches images as AI SDK file parts", async () => {
    const runner = new Gen2EVercelRunner({ model });
    await runner.run({
      taskPrompt: "task",
      systemMessage: "system",
      images: [Buffer.from("fake-image")],
      tools: [],
    });

    expect(runArgs().messages[0].content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "file",
          mediaType: "image/jpeg",
        }),
      ]),
    );
  });

  test("maps gen2e tools to AI SDK tools", async () => {
    const toolFn = jest.fn().mockReturnValue(true);
    const parse = jest.fn((args: string) => JSON.parse(args));
    const toolDef: Gen2ELLMAgentTool<{ code: string }> = {
      name: "code_validation_tool",
      description: "validates code",
      parameters: {
        type: "object",
        properties: { code: { type: "string" } },
      },
      function: toolFn,
      parse,
    };

    const runner = new Gen2EVercelRunner({ model });
    await runner.run({
      taskPrompt: "task",
      systemMessage: "system",
      tools: [toolDef],
    });

    expect(mockJsonSchema).toHaveBeenCalledWith(toolDef.parameters);
    const calls = mockGenerateText.mock.calls as unknown as Array<[GenerateTextArgs]>;
    const executed = await calls[0][0].tools.code_validation_tool.execute({
      code: "let x = 1;",
    });

    expect(parse).toHaveBeenCalledWith(JSON.stringify({ code: "let x = 1;" }));
    expect(toolFn).toHaveBeenCalledWith({ code: "let x = 1;" });
    expect(executed).toBe(true);
  });

  test("emits assistant messages through hooks on step finish", async () => {
    const onMessage = jest.fn();
    const runner = new Gen2EVercelRunner({ model });
    await runner.run({ taskPrompt: "task", systemMessage: "system", tools: [] }, { onMessage });

    const calls = mockGenerateText.mock.calls as unknown as Array<[GenerateTextArgs]>;
    calls[0][0].onStepFinish?.({ text: "step text" });

    expect(onMessage).toHaveBeenCalledWith({
      role: "assistant",
      content: "step text",
    });
  });

  test("returns an error when generation throws", async () => {
    mockGenerateText.mockRejectedValueOnce(new Error("boom"));
    const runner = new Gen2EVercelRunner({ model });

    const result = await runner.run({
      taskPrompt: "task",
      systemMessage: "system",
      tools: [],
    });

    expect(result).toEqual({ type: "error", reason: "got error boom" });
  });

  test("returns an error for empty final content", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: "",
      totalUsage: {},
      steps: [],
    });
    const runner = new Gen2EVercelRunner({ model });

    const result = await runner.run({
      taskPrompt: "task",
      systemMessage: "system",
      tools: [],
    });

    expect(result).toEqual({
      type: "error",
      reason: "got empty final result",
    });
  });

  test("forwards custom headers", async () => {
    const runner = new Gen2EVercelRunner({
      model,
      headers: { "x-test": "1" },
    });
    await runner.run({
      taskPrompt: "task",
      systemMessage: "system",
      tools: [],
    });

    expect(runArgs().headers).toEqual({ "x-test": "1" });
  });
});
