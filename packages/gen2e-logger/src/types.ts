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

export interface Gen2eLogger {
  debug(...args: any[]): unknown;
  info(...args: any[]): unknown;
  warn(...args: any[]): unknown;
  error(...args: any[]): unknown;
}

export type Gen2eLoggerSinkFunc = (out: string) => unknown;
export type Gen2eLoggerSinks =
  | {
      [key in "debug" | "info" | "warn" | "error"]: Gen2eLoggerSinkFunc;
    }
  | Gen2eLoggerSinkFunc;
