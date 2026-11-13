import { describe, expect, jest, mock, test } from "bun:test";
import { type Gen2ELoggerArgsFmt, type Gen2ELoggerSinkFunc, makeLogger } from "../../src";

const runtimeInfo = {
  funcName: "testFunc",
  filepath: "/path/to/file.ts",
  file: "file.ts",
  line: 10,
  col: 15,
};

mock.module("../../src/callstack", () => ({
  runtimeExecutionInfo: () => runtimeInfo,
}));

const levels = [
  ["debug", "blue", "\x1b[94m"],
  ["info", "green", "\x1b[32m"],
  ["warn", "yellow", "\x1b[33m"],
  ["error", "red", "\x1b[31m"],
] as const;

const sinksTo = (sink: Gen2ELoggerSinkFunc) => ({
  debug: sink,
  info: sink,
  warn: sink,
  error: sink,
});

describe("makeLogger", () => {
  test.each(levels)(
    "%s writes a colored, tagged line with the call site",
    (level, _color, ansi) => {
      const sink = jest.fn();

      makeLogger("GEN2E", undefined, sinksTo(sink))[level]("hello");

      expect(sink).toHaveBeenCalledWith(
        expect.stringContaining(`${ansi}[GEN2E-${level.toUpperCase()}]\x1b[0m file.ts:10:15 hello`),
      );
    },
  );

  test.each(levels)(
    "%s passes tag, color, call site and args to a custom format",
    (level, color) => {
      const sink = jest.fn();
      const fmt: Gen2ELoggerArgsFmt = jest.fn(() => "formatted");

      makeLogger("GEN2E", fmt, sinksTo(sink))[level]("hello", 1);

      expect(fmt).toHaveBeenCalledWith(
        `GEN2E-${level.toUpperCase()}`,
        color,
        runtimeInfo,
        "hello",
        1,
      );
      expect(sink).toHaveBeenCalledWith("formatted");
    },
  );
});

describe("logger.config", () => {
  const setup = () => {
    const sink1 = jest.fn();
    const sink2 = jest.fn();
    const fmt1: Gen2ELoggerArgsFmt = jest.fn(() => "one");
    const fmt2: Gen2ELoggerArgsFmt = jest.fn(() => "two");
    const logger1 = makeLogger("GEN2E", fmt1, sinksTo(sink1));
    const logger2 = makeLogger("GEN2E_ALT", fmt2, sinksTo(sink2));
    return { sink1, sink2, fmt1, fmt2, logger1, logger2 };
  };

  test("adopts another logger's format and sinks but keeps its own tag", () => {
    const { sink1, sink2, fmt2, logger1, logger2 } = setup();

    logger1.config(logger2);
    logger1.warn("hello");

    expect(fmt2).toHaveBeenCalledWith("GEN2E-WARN", "yellow", runtimeInfo, "hello");
    expect(sink2).toHaveBeenCalledWith("two");
    expect(sink1).not.toHaveBeenCalled();
  });

  test("applies a plain config object", () => {
    const { sink2, fmt2, logger1 } = setup();

    logger1.config({ fmt: fmt2, sinks: sinksTo(sink2) });
    logger1.info("hello");

    expect(sink2).toHaveBeenCalledWith("two");
  });

  test("leaves the source logger unchanged", () => {
    const { fmt2, logger1, logger2 } = setup();

    logger1.config(logger2);
    logger2.error("hello");

    expect(fmt2).toHaveBeenCalledWith("GEN2E_ALT-ERROR", "red", runtimeInfo, "hello");
  });
});
