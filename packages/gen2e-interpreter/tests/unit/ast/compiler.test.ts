import { describe, expect, test } from "bun:test";
import { makeTransformer } from "../../../src";

describe("makeTransformer", () => {
  test("runs the transformer on the source and returns its result", () => {
    const compile = makeTransformer<string>((fileInfo) => `transformed ${fileInfo.source}`);

    expect(compile("const x = 1;")).toBe("transformed const x = 1;");
  });
});
