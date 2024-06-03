export * from "./types";
export * from "./callstack";

import {
  Gen2ELoggerArgsFmt,
  Gen2ELoggerRuntimeCallInfo,
  Gen2ELoggerTag,
  Gen2ELoggerTagColor,
  Gen2eLogger,
  Gen2eLoggerSinks,
} from "./types";

import util from "util";

import { runtimeExecutionInfo } from "./callstack";

const defaultArgsSerializer: Gen2ELoggerArgsFmt = (
  tag: Gen2ELoggerTag,
  tagColor: Gen2ELoggerTagColor,
  rinfo: Gen2ELoggerRuntimeCallInfo,
  ...args
) => {
  const colorMap: { [key in Gen2ELoggerTagColor]: string } = {
    white: "\x1b[37m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[94m",
  };

  const colorCode = colorMap[tagColor] || "\x1b[37m";
  const resetCode = "\x1b[0m";

  return `${colorCode}[${tag.toUpperCase()}]${resetCode} ${rinfo.file}:${
    rinfo.line
  }:${rinfo.col} ${args
    .map((arg) =>
      typeof arg === "object"
        ? util.inspect(arg, { depth: Infinity, colors: true })
        : arg
    )
    .join(" ")}`;
};

export const makeLogger = (
  tag: Gen2ELoggerTag = "GEN2E",
  as: Gen2ELoggerArgsFmt = defaultArgsSerializer,
  sinks: Gen2eLoggerSinks = {
    info: (s) => process.stdout.write(s + "\n"),
    debug: (s) => process.stdout.write(s + "\n"),
    warn: (s) => process.stdout.write(s + "\n"),
    error: (s) => process.stderr.write(s + "\n"),
  }
): Gen2eLogger => {
  return new (class _CustomLogger implements Gen2eLogger {
    private sDepth: number = 4;
    constructor() {}

    debug(...args: any[]): unknown {
      const rinfo = runtimeExecutionInfo(this.sDepth);
      const s = as(`${tag}-DEBUG`, "blue", rinfo, ...args);
      const sink = typeof sinks === "function" ? sinks : sinks.debug;
      return sink(s);
    }

    info(...args: any[]): unknown {
      const rinfo = runtimeExecutionInfo(this.sDepth);
      const s = as(`${tag}-INFO`, "green", rinfo, ...args);
      const sink = typeof sinks === "function" ? sinks : sinks.info;
      return sink(s);
    }

    warn(...args: any[]): unknown {
      const rinfo = runtimeExecutionInfo(this.sDepth);
      const s = as(`${tag}-WARN`, "yellow", rinfo, ...args);
      const sink = typeof sinks === "function" ? sinks : sinks.warn;
      return sink(s);
    }

    error(...args: any[]): unknown {
      const rinfo = runtimeExecutionInfo(this.sDepth);
      const s = as(`${tag}-ERR`, "red", rinfo, ...args);
      const sink = typeof sinks === "function" ? sinks : sinks.error;
      return sink(s);
    }
  })();
};

const stdLogger = makeLogger();
export default stdLogger;
