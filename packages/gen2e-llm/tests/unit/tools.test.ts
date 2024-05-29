import {
  ChatCompletionRunner,
  RunnableFunctionWithParse,
} from "openai/resources/beta/chat/completions";
import {
  makeTool,
  makeFormatTool,
  makeTracedTool,
  TracedRunnableFunctionWithParse,
} from "../../src";

describe("makeTracedTool", () => {
  interface TestArgs {
    input: string;
  }

  const mockToolFunction: RunnableFunctionWithParse<TestArgs> = {
    function: jest.fn(),
    parameters: {
      type: "object",
      properties: {
        input: {
          type: "string",
          description: "",
        },
      },
    },
    description: "",
    parse: jest.fn(),
  };

  let tracedTool: TracedRunnableFunctionWithParse<TestArgs>;
  beforeEach(() => {
    tracedTool = makeTracedTool(mockToolFunction);
  });

  test("should call the original function with correct arguments", async () => {
    const args = { input: "test" };
    const runner = {} as ChatCompletionRunner;
    await tracedTool.function(args, runner);
    expect(mockToolFunction.function).toHaveBeenCalledWith(args, runner);
  });

  test("should increment call count correctly", async () => {
    const args = { input: "test" };
    const runner = {} as ChatCompletionRunner;
    expect(tracedTool.callCount()).toBe(0);
    await tracedTool.function(args, runner);
    expect(tracedTool.callCount()).toBe(1);
    await tracedTool.function(args, runner);
    expect(tracedTool.callCount()).toBe(2);
  });
});

describe("makeFormatTool", () => {
  const mockValidator = jest.fn();

  let formatTool: ReturnType<typeof makeFormatTool>;

  beforeEach(() => {
    formatTool = makeFormatTool(mockValidator);
  });

  test("should validate the provided code", () => {
    const args = { code: "test code" };
    const runner = {} as ChatCompletionRunner;
    mockValidator.mockReturnValue({ success: true });
    const result = formatTool.function(args, runner);
    expect(mockValidator).toHaveBeenCalledWith(args);
    expect(result).toEqual({ success: true });
  });

  test("should return validation failure reason", () => {
    const args = { code: "invalid code" };
    const runner = {} as ChatCompletionRunner;
    mockValidator.mockReturnValue({ success: false, reason: "Invalid format" });
    const result = formatTool.function(args, runner);
    expect(mockValidator).toHaveBeenCalledWith(args);
    expect(result).toEqual({ success: false, reason: "Invalid format" });
  });

  test("should correctly parse input arguments", () => {
    const argsString = JSON.stringify({ code: "parsed code" });
    const parsedArgs = formatTool.parse(argsString);
    expect(parsedArgs).toEqual({ code: "parsed code" });
  });

  test("should throw an error for invalid input arguments", () => {
    const invalidArgsString = JSON.stringify({ invalid: "data" });
    expect(() => formatTool.parse(invalidArgsString)).toThrow();
  });
});

describe("makeTool", () => {
  const mockValidator = jest.fn();

  let tool: ReturnType<typeof makeTool>;

  beforeEach(() => {
    tool = makeTool(mockValidator, "Additional details");
  });

  test("should validate the provided code", () => {
    const args = { code: "test code" };
    const runner = {} as ChatCompletionRunner;
    mockValidator.mockReturnValue(true);
    const result = tool.function(args, runner);
    expect(mockValidator).toHaveBeenCalledWith(args);
    expect(result).toBe(true);
  });

  test("should return false when validation fails", () => {
    const args = { code: "invalid code" };
    const runner = {} as ChatCompletionRunner;
    mockValidator.mockReturnValue(false);
    const result = tool.function(args, runner);
    expect(mockValidator).toHaveBeenCalledWith(args);
    expect(result).toBe(false);
  });

  test("should correctly parse input arguments", () => {
    const argsString = JSON.stringify({ code: "parsed code" });
    const parsedArgs = tool.parse(argsString);
    expect(parsedArgs).toEqual({ code: "parsed code" });
  });

  test("should throw an error for invalid input arguments", () => {
    const invalidArgsString = JSON.stringify({ invalid: "data" });
    expect(() => tool.parse(invalidArgsString)).toThrow();
  });
});
