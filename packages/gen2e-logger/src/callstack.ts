import { Gen2ELoggerRuntimeCallInfo } from "./types";

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

/**
 * Retrieves execution information from the current runtime stack trace.
 *
 * @param {number} depth - The depth of the stack trace to retrieve. Defaults to 3.
 * @param {() => string | undefined} readStack - A function that returns a stack trace string.
 * @returns {Gen2ELoggerRuntimeCallInfo} An object containing information about the function call.
 */
export const runtimeExecutionInfo = (
  depth: number = 3,
  readStack: () => string | undefined = () => new Error().stack
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
    let stackLine = stack.split("\n")[depth];
    const match = regex.exec(stackLine);
    if (match?.length) {
      const file = match[1].split(win ? "\\" : "/").pop();
      const [filepathLC] = match;
      let filepath = "",
        _line = "",
        _col = "";
      if (win) {
        const [vol, path, line, col] = filepathLC
          .strip(")")
          .strip("(")
          .split(":");
        filepath = vol + ":" + path;
        _line = line;
        _col = col;
      } else {
        [filepath, _line, _col] = filepathLC.strip(")").strip("(").split(":");
      }
      const [funcName] = stackLine.trim().replace("at ", "").split(" ");
      let line = parseInt(_line);
      if (isNaN(line)) line = 0;
      let col = parseInt(_col);
      if (isNaN(col)) col = 0;
      result.funcName = funcName;
      result.filepath = filepath;
      result.file = file ?? "";
      result.line = line;
      result.col = col;
    }
  }

  return result;
};
