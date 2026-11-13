import { describe, expect, test } from "bun:test";
import { runtimeExecutionInfo } from "../../src";

const empty = { funcName: "", filepath: "", file: "", line: 0, col: 0 };

describe("String.prototype.strip", () => {
  test.each([
    ["  hello  ", undefined, "hello"],
    ["xxhelloxx", "x", "hello"],
    ["xyzhelloxyz", "xyz", "hello"],
    ["xyhelxylo", "xy", "helxylo"],
    ["hello", "x", "hello"],
  ])("%p.strip(%p) is %p", (input, chars, expected) => {
    expect(input.strip(chars)).toBe(expected);
  });
});

describe("runtimeExecutionInfo", () => {
  test("reads the function, path, line and column of a stack frame", () => {
    const stack = "Error\n  at mockFunc (/path/to/file.ts:10:15)\n  at other (b.ts:20:25)";

    expect(runtimeExecutionInfo(1, () => stack)).toEqual({
      funcName: "mockFunc",
      filepath: "/path/to/file.ts",
      file: "file.ts",
      line: 10,
      col: 15,
    });
  });

  test.each([
    ["no stack", undefined],
    ["an unparsable frame", "Error\n  at unknownFunction (unknownfile)"],
  ])("returns empty info for %s", (_name, stack) => {
    expect(runtimeExecutionInfo(1, () => stack)).toEqual(empty);
  });

  test("handles Windows paths", () => {
    const platform = process.platform;
    Object.defineProperty(process, "platform", { value: "win32" });

    try {
      const res = runtimeExecutionInfo(
        1,
        () => "Error\n  at mockFunc (C:\\path\\to\\file.ts:10:15)",
      );
      expect(res).toEqual({
        funcName: "mockFunc",
        filepath: "C:\\path\\to\\file.ts",
        file: "file.ts",
        line: 10,
        col: 15,
      });
    } finally {
      Object.defineProperty(process, "platform", { value: platform });
    }
  });
});
