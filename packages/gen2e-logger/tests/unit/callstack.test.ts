import { runtimeExecutionInfo, Gen2ELoggerRuntimeCallInfo } from "../../src";

describe("String.prototype.strip", () => {
  it("should remove leading and trailing spaces by default", () => {
    expect("  hello  ".strip()).toBe("hello");
  });

  it("should remove specified characters from the beginning and end", () => {
    expect("xxhelloxx".strip("x")).toBe("hello");
  });

  it("should remove multiple characters from the beginning and end", () => {
    expect("xyzhelloxyz".strip("xyz")).toBe("hello");
  });

  it("should not remove characters from the middle", () => {
    expect("xyhelloxy".strip("xy")).toBe("hello");
  });

  it("should return the same string if the chars are not present", () => {
    expect("hello".strip("x")).toBe("hello");
  });
});

describe("runtimeExecutionInfo", () => {
  it("should extract runtime call information correctly", () => {
    const mockStack = `Error
      at mockFunc (/path/to/file.ts:10:15)
      at someOtherFunction (anotherFile.ts:20:25)`;

    const mockReadStack = jest.fn(() => mockStack);

    const result = runtimeExecutionInfo(1, mockReadStack);

    expect(result).toEqual({
      funcName: "mockFunc",
      filepath: "/path/to/file.ts",
      file: "file.ts",
      line: 10,
      col: 15,
    });
  });

  it("should handle missing stack trace gracefully", () => {
    const mockReadStack = jest.fn(() => undefined);

    const result = runtimeExecutionInfo(1, mockReadStack);

    expect(result).toEqual({
      funcName: "",
      filepath: "",
      file: "",
      line: 0,
      col: 0,
    });
  });

  it("should handle stack trace without match gracefully", () => {
    const mockStack = `Error
      at unknownFunction (unknownfile)`;

    const mockReadStack = jest.fn(() => mockStack);

    const result = runtimeExecutionInfo(1, mockReadStack);

    expect(result).toEqual({
      funcName: "",
      filepath: "",
      file: "",
      line: 0,
      col: 0,
    });
  });

  it("should handle Windows file paths correctly", () => {
    const mockStack = `Error
      at mockFunc (C:\\path\\to\\file.ts:10:15)
      at someOtherFunction (anotherFile.ts:20:25)`;

    const mockReadStack = jest.fn(() => mockStack);

    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", {
      value: "win32",
    });

    const result = runtimeExecutionInfo(1, mockReadStack);

    Object.defineProperty(process, "platform", {
      value: originalPlatform,
    });

    expect(result).toEqual({
      funcName: "mockFunc",
      filepath: "C:\\path\\to\\file.ts",
      file: "file.ts",
      line: 10,
      col: 15,
    });
  });
});
