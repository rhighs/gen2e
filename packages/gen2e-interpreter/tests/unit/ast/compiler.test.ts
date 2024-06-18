import {
  makeTransformer,
  Gen2ETransformFunction,
  Gen2ETransformer,
} from "../../../src";

describe("makeTransformer", () => {
  const mockTransformer: Gen2ETransformer<string> = (fileInfo, api) => {
    return `transformed ${fileInfo.source}`;
  };

  test("should compile source correctly", () => {
    const compile: Gen2ETransformFunction<string> = makeTransformer(mockTransformer);
    const source = "const x = 1;";
    const result = compile(source);

    expect(result).toBe(`transformed ${source}`);
  });

  test("should pass fileInfo and api to transformer correctly", () => {
    const mockTransformer: Gen2ETransformer<string> = jest
      .fn()
      .mockReturnValue("mocked result");
    const compile: Gen2ETransformFunction<string> = makeTransformer(mockTransformer);
    const source = "const y = 2;";
    const result = compile(source);

    expect(result).toBe("mocked result");
    expect(mockTransformer).toHaveBeenCalledWith(
      { path: "", source },
      {
        j: expect.anything(),
        jscodeshift: expect.anything(),
        stats: expect.any(Function),
        report: expect.any(Function),
      },
      expect.any(Object)
    );
  });
});
