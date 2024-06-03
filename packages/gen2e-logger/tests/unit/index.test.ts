import { Gen2ELoggerArgsFmt, makeLogger, default as stdLogger } from "../../src";
import { Gen2ELoggerRuntimeCallInfo } from "../../src";

jest.mock("../../src/callstack", () => ({
  runtimeExecutionInfo: (depth: number): Gen2ELoggerRuntimeCallInfo => ({
    funcName: "testFunc",
    filepath: "/path/to/file.ts",
    file: "file.ts",
    line: 10,
    col: 15,
  }),
}));

describe("Gen2E std logger", () => {
  const mockSink = jest.fn();
  const sinks = {
    debug: mockSink,
    info: mockSink,
    warn: mockSink,
    error: mockSink,
  };

  const logger = makeLogger("GEN2E", undefined, sinks);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should log debug messages correctly", () => {
    logger.debug("Debug message");
    expect(mockSink).toHaveBeenCalledWith(
      expect.stringContaining(
        "\x1b[94m[GEN2E-DEBUG]\x1b[0m file.ts:10:15 Debug message"
      )
    );
  });

  it("should log info messages correctly", () => {
    logger.info("Info message");
    expect(mockSink).toHaveBeenCalledWith(
      expect.stringContaining(
        "\x1b[32m[GEN2E-INFO]\x1b[0m file.ts:10:15 Info message"
      )
    );
  });

  it("should log warn messages correctly", () => {
    logger.warn("Warn message");
    expect(mockSink).toHaveBeenCalledWith(
      expect.stringContaining(
        "\x1b[33m[GEN2E-WARN]\x1b[0m file.ts:10:15 Warn message"
      )
    );
  });

  it("should log error messages correctly", () => {
    logger.error("Error message");
    expect(mockSink).toHaveBeenCalledWith(
      expect.stringContaining(
        "\x1b[31m[GEN2E-ERR]\x1b[0m file.ts:10:15 Error message"
      )
    );
  });

  it("should use the correct color codes", () => {
    logger.debug("Debug message");
    expect(mockSink).toHaveBeenCalledWith(
      expect.stringContaining("\x1b[94m[GEN2E-DEBUG]\x1b[0m")
    );

    logger.info("Info message");
    expect(mockSink).toHaveBeenCalledWith(
      expect.stringContaining("\x1b[32m[GEN2E-INFO]\x1b[0m")
    );

    logger.warn("Warn message");
    expect(mockSink).toHaveBeenCalledWith(
      expect.stringContaining("\x1b[33m[GEN2E-WARN]\x1b[0m")
    );

    logger.error("Error message");
    expect(mockSink).toHaveBeenCalledWith(
      expect.stringContaining("\x1b[31m[GEN2E-ERR]\x1b[0m")
    );
  });
});

describe("Gen2E std logger args fmt", () => {
  const mockSink = jest.fn();
  const mockSerializer: Gen2ELoggerArgsFmt = jest.fn(() => "");

  const sinks = {
    debug: mockSink,
    info: mockSink,
    warn: mockSink,
    error: mockSink,
  };

  const logger = makeLogger("GEN2E", mockSerializer, sinks);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should call the serializer with the correct parameters for debug messages", () => {
    logger.debug("Debug message");
    expect(mockSerializer).toHaveBeenCalledWith(
      "GEN2E-DEBUG",
      "blue",
      {
        funcName: "testFunc",
        filepath: "/path/to/file.ts",
        file: "file.ts",
        line: 10,
        col: 15,
      },
      "Debug message"
    );
    expect(mockSink).toHaveBeenCalledWith("");
  });

  it("should call the serializer with the correct parameters for info messages", () => {
    logger.info("Info message");
    expect(mockSerializer).toHaveBeenCalledWith(
      "GEN2E-INFO",
      "green",
      {
        funcName: "testFunc",
        filepath: "/path/to/file.ts",
        file: "file.ts",
        line: 10,
        col: 15,
      },
      "Info message"
    );
    expect(mockSink).toHaveBeenCalledWith("");
  });

  it("should call the serializer with the correct parameters for warn messages", () => {
    logger.warn("Warn message");
    expect(mockSerializer).toHaveBeenCalledWith(
      "GEN2E-WARN",
      "yellow",
      {
        funcName: "testFunc",
        filepath: "/path/to/file.ts",
        file: "file.ts",
        line: 10,
        col: 15,
      },
      "Warn message"
    );
    expect(mockSink).toHaveBeenCalledWith("");
  });

  it("should call the serializer with the correct parameters for error messages", () => {
    logger.error("Error message");
    expect(mockSerializer).toHaveBeenCalledWith(
      "GEN2E-ERR",
      "red",
      {
        funcName: "testFunc",
        filepath: "/path/to/file.ts",
        file: "file.ts",
        line: 10,
        col: 15,
      },
      "Error message"
    );
    expect(mockSink).toHaveBeenCalledWith("");
  });
});
