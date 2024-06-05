export * from "./types";
export * from "./callstack";

import {
  Gen2ELoggerArgsFmt,
  Gen2ELoggerRuntimeCallInfo,
  Gen2ELoggerTag,
  Gen2ELoggerTagColor,
  Gen2ELogger,
  Gen2ELoggerSinkTag,
  Gen2ELoggerSinks,
  Gen2ELoggerConfig,
} from "./types";

import util from "util";

import { runtimeExecutionInfo } from "./callstack";

const defaultArgsFmt: Gen2ELoggerArgsFmt = (
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

  return `${colorCode}[${tag.toUpperCase()}]${resetCode}${
    rinfo.file !== "" ? ` ${rinfo.file}:${rinfo.line}:${rinfo.col}` : ""
  } ${args
    .map((arg) =>
      typeof arg === "object"
        ? util.inspect(arg, {
            depth: Infinity,
            colors: true,
            maxStringLength: Infinity,
          })
        : arg
    )
    .join(" ")}`;
};

export const makeLogger = (
  tag: Gen2ELoggerTag = "GEN2E",
  _fmt: Gen2ELoggerArgsFmt = defaultArgsFmt,
  _sinks: Gen2ELoggerSinks = {
    info: (s) => process.stdout.write(s + "\n"),
    debug: (s) => process.stdout.write(s + "\n"),
    warn: (s) => process.stdout.write(s + "\n"),
    error: (s) => process.stderr.write(s + "\n"),
  }
): Gen2ELogger => {
  return new (class _Gen2ELogger implements Gen2ELogger {
    private fmt: Gen2ELoggerArgsFmt;
    private sinks: Gen2ELoggerSinks;
    constructor(_as: Gen2ELoggerArgsFmt, _sinks: Gen2ELoggerSinks) {
      this.fmt = _as;
      this.sinks = _sinks;
    }

    dump(
      metatag: Gen2ELoggerSinkTag,
      color: Gen2ELoggerTagColor,
      ...args: any[]
    ): unknown {
      const rinfo = runtimeExecutionInfo(5);
      const sink =
        typeof this.sinks === "function" ? this.sinks : this.sinks[metatag];
      return sink(
        this.fmt(
          `${tag}-${(metatag as string).toUpperCase()}`,
          color,
          rinfo,
          ...args
        )
      );
    }

    debug(this: _Gen2ELogger, ...args: any[]): unknown {
      return this.dump("debug", "blue", ...args);
    }

    info(this: _Gen2ELogger, ...args: any[]): unknown {
      return this.dump("info", "green", ...args);
    }

    warn(this: _Gen2ELogger, ...args: any[]): unknown {
      return this.dump("warn", "yellow", ...args);
    }

    error(this: _Gen2ELogger, ...args: any[]): unknown {
      return this.dump("error", "red", ...args);
    }

    config(from: Gen2ELoggerConfig | Gen2ELogger): void {
      from = from as any;
      if ("sinks" in from) {
        this.sinks = (from as any).sinks;
      }
      if ("fmt" in from) {
        this.fmt = (from as any).fmt;
      }
    }
  })(_fmt, _sinks);
};

const stdLogger = makeLogger();
export default stdLogger;
