export type Gen2ELoggerTag = string;
export type Gen2ELoggerTagColor = "white" | "red" | "green" | "yellow" | "blue";

export type Gen2ELoggerRuntimeCallInfo = {
  funcName: string;
  filepath: string;
  file: string;
  line: number;
  col: number;
};

export type Gen2ELoggerArgsFmt = (
  tag: Gen2ELoggerTag,
  tagColor: Gen2ELoggerTagColor,
  runtimeInfo: Gen2ELoggerRuntimeCallInfo,
  ...args: any
) => string;

export type Gen2ELoggerSinkFunc = (out: string) => unknown;
export type Gen2ELoggerSinkTag = "debug" | "info" | "warn" | "error";
export type Gen2ELoggerSinks =
  | {
      [key in Gen2ELoggerSinkTag]: Gen2ELoggerSinkFunc;
    }
  | Gen2ELoggerSinkFunc;

export type Gen2ELoggerConfig = {
  sinks?: Gen2ELoggerSinks;
  fmt?: Gen2ELoggerArgsFmt;
};

export interface Gen2ELogger {
  debug(...args: any[]): unknown;
  info(...args: any[]): unknown;
  warn(...args: any[]): unknown;
  error(...args: any[]): unknown;
  config(loggerCfg: Gen2ELoggerConfig): void;
  config(from: Gen2ELogger): void;
}
