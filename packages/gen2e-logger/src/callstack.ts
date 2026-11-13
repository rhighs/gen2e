import type { Gen2ELoggerRuntimeCallInfo } from "./types";

declare global {
  interface String {
    strip(chars?: string): string;
  }
}

(String.prototype as any).strip = function (chars: string = " "): string {
  let result = String(this);
  while (result.startsWith(chars)) {
    result = result.substring(chars.length, result.length);
  }
  while (result.endsWith(chars)) {
    result = result.substring(0, result.length - chars.length);
  }
  return result;
};

const isWindows = (): boolean => process.platform === "win32";

export const runtimeExecutionInfo = (
  depth: number = 3,
  readStack: () => string | undefined = () => new Error().stack,
): Gen2ELoggerRuntimeCallInfo => {
  const regex = /\((.*):(\d+):(\d+)\)$/;
  const result = {
    funcName: "",
    filepath: "",
    file: "",
    line: 0,
    col: 0,
  };

  const stack = readStack();
  if (stack) {
    const win = isWindows();
    const stackLine = stack.split("\n")[depth];
    const match = regex.exec(stackLine);
    if (match?.length) {
      const file = match[1].split(win ? "\\" : "/").pop();
      const [filepathLC] = match;
      let filepath = "";
      let _line = "";
      let _col = "";
      if (win) {
        const [vol, path, line, col] = filepathLC.strip(")").strip("(").split(":");
        filepath = `${vol}:${path}`;
        _line = line;
        _col = col;
      } else {
        [filepath, _line, _col] = filepathLC.strip(")").strip("(").split(":");
      }
      const [funcName] = stackLine.trim().replace("at ", "").split(" ");
      const line = parseInt(_line, 10);
      const col = parseInt(_col, 10);
      result.funcName = funcName;
      result.filepath = filepath;
      result.file = file ?? "";
      result.line = Number.isNaN(line) ? 0 : line;
      result.col = Number.isNaN(col) ? 0 : col;
    }
  }

  return result;
};
