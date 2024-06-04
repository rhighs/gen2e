import {
  makeCompiler,
  Gen2ECompileFunction,
  Gen2ECompilerTransformer,
} from "../../../src";

describe("makeCompiler", () => {
  const mockTransformer: Gen2ECompilerTransformer = (fileInfo, api) => {
    return `transformed ${fileInfo.source}`;
  };

  test("should compile source correctly", () => {
    const compile: Gen2ECompileFunction = makeCompiler(mockTransformer);
    const source = "const x = 1;";
    const result = compile(source);

    expect(result).toBe(`transformed ${source}`);
  });

  test("should pass fileInfo and api to transformer correctly", () => {
    const mockTransformer: Gen2ECompilerTransformer = jest
      .fn()
      .mockReturnValue("mocked result");
    const compile: Gen2ECompileFunction = makeCompiler(mockTransformer);
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
