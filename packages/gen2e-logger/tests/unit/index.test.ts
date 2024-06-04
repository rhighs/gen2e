import { Gen2ELoggerArgsFmt, makeLogger } from "../../src";
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
        "\x1b[31m[GEN2E-ERROR]\x1b[0m file.ts:10:15 Error message"
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
      expect.stringContaining("\x1b[31m[GEN2E-ERROR]\x1b[0m")
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
      "GEN2E-ERROR",
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

describe("Gen2E logger config", () => {
  const mockSink1 = jest.fn();
  const mockSink2 = jest.fn();
  const mockSerializer1: Gen2ELoggerArgsFmt = jest.fn(
    () => "Serialized message 1"
  );
  const mockSerializer2: Gen2ELoggerArgsFmt = jest.fn(
    () => "Serialized message 2"
  );

  const sinks1 = {
    debug: mockSink1,
    info: mockSink1,
    warn: mockSink1,
    error: mockSink1,
  };

  const sinks2 = {
    debug: mockSink2,
    info: mockSink2,
    warn: mockSink2,
    error: mockSink2,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should preserve the tag when another config is passed", () => {
    const logger1 = makeLogger("GEN2E", mockSerializer1, sinks1);
    const logger2 = makeLogger("GEN2E_ALT", mockSerializer2, sinks2);
    logger1.config(logger2);

    logger1.debug("Debug message");
    expect(mockSerializer2).toHaveBeenCalledWith(
      "GEN2E-DEBUG",
      "blue",
      expect.any(Object),
      "Debug message"
    );
    expect(mockSink2).toHaveBeenCalledWith("Serialized message 2");

    logger1.info("Info message");
    expect(mockSerializer2).toHaveBeenCalledWith(
      "GEN2E-INFO",
      "green",
      expect.any(Object),
      "Info message"
    );
    expect(mockSink2).toHaveBeenCalledWith("Serialized message 2");

    logger1.warn("Warn message");
    expect(mockSerializer2).toHaveBeenCalledWith(
      "GEN2E-WARN",
      "yellow",
      expect.any(Object),
      "Warn message"
    );
    expect(mockSink2).toHaveBeenCalledWith("Serialized message 2");

    logger1.error("Error message");
    expect(mockSerializer2).toHaveBeenCalledWith(
      "GEN2E-ERROR",
      "red",
      expect.any(Object),
      "Error message"
    );
    expect(mockSink2).toHaveBeenCalledWith("Serialized message 2");
  });

  it("should apply new sinks and format from config", () => {
    const logger1 = makeLogger("GEN2E", mockSerializer1, sinks1);
    const _logger2 = makeLogger("GEN2E_ALT", mockSerializer2, sinks2);
    logger1.config({ fmt: mockSerializer2, sinks: sinks2 });

    logger1.debug("Debug message");
    expect(mockSerializer2).toHaveBeenCalledWith(
      "GEN2E-DEBUG",
      "blue",
      expect.any(Object),
      "Debug message"
    );
    expect(mockSink2).toHaveBeenCalledWith("Serialized message 2");

    logger1.info("Info message");
    expect(mockSerializer2).toHaveBeenCalledWith(
      "GEN2E-INFO",
      "green",
      expect.any(Object),
      "Info message"
    );
    expect(mockSink2).toHaveBeenCalledWith("Serialized message 2");

    logger1.warn("Warn message");
    expect(mockSerializer2).toHaveBeenCalledWith(
      "GEN2E-WARN",
      "yellow",
      expect.any(Object),
      "Warn message"
    );
    expect(mockSink2).toHaveBeenCalledWith("Serialized message 2");

    logger1.error("Error message");
    expect(mockSerializer2).toHaveBeenCalledWith(
      "GEN2E-ERROR",
      "red",
      expect.any(Object),
      "Error message"
    );
    expect(mockSink2).toHaveBeenCalledWith("Serialized message 2");
  });

  it("should not affect the original logger configuration", () => {
    const logger1 = makeLogger("GEN2E", mockSerializer1, sinks1);
    const logger2 = makeLogger("GEN2E_ALT", mockSerializer2, sinks2);
    logger1.config(logger2);

    logger2.debug("Debug message");
    expect(mockSerializer2).toHaveBeenCalledWith(
      "GEN2E_ALT-DEBUG",
      "blue",
      expect.any(Object),
      "Debug message"
    );
    expect(mockSink2).toHaveBeenCalledWith("Serialized message 2");

    logger2.info("Info message");
    expect(mockSerializer2).toHaveBeenCalledWith(
      "GEN2E_ALT-INFO",
      "green",
      expect.any(Object),
      "Info message"
    );
    expect(mockSink2).toHaveBeenCalledWith("Serialized message 2");

    logger2.warn("Warn message");
    expect(mockSerializer2).toHaveBeenCalledWith(
      "GEN2E_ALT-WARN",
      "yellow",
      expect.any(Object),
      "Warn message"
    );
    expect(mockSink2).toHaveBeenCalledWith("Serialized message 2");

    logger2.error("Error message");
    expect(mockSerializer2).toHaveBeenCalledWith(
      "GEN2E_ALT-ERROR",
      "red",
      expect.any(Object),
      "Error message"
    );
    expect(mockSink2).toHaveBeenCalledWith("Serialized message 2");
  });

  it("should call logger1.fmt with the tags from logger2", () => {
    const logger1 = makeLogger("GEN2E", mockSerializer1, sinks1);
    const logger2 = makeLogger("GEN2E_ALT", mockSerializer2, sinks2);
    logger2.config(logger1);

    logger2.debug("Debug message");
    expect(mockSerializer1).toHaveBeenCalledWith(
      "GEN2E_ALT-DEBUG",
      "blue",
      expect.any(Object),
      "Debug message"
    );

    logger2.info("Info message");
    expect(mockSerializer1).toHaveBeenCalledWith(
      "GEN2E_ALT-INFO",
      "green",
      expect.any(Object),
      "Info message"
    );

    logger2.warn("Warn message");
    expect(mockSerializer1).toHaveBeenCalledWith(
      "GEN2E_ALT-WARN",
      "yellow",
      expect.any(Object),
      "Warn message"
    );

    logger2.error("Error message");
    expect(mockSerializer1).toHaveBeenCalledWith(
      "GEN2E_ALT-ERROR",
      "red",
      expect.any(Object),
      "Error message"
    );
  });
});
