const makeMessage = (...args: any[]): string =>
  args
    .map((arg) =>
      typeof arg === "object" ? JSON.stringify(arg, null, 2) : arg
    )
    .join(" ");
export const info = (...args: any[]): unknown => (
  process.stderr.write(`\x1b[32m[INFO]\x1b[0m: ${makeMessage(...args)}\n`), 0
);
export const err = (...args: any[]): unknown => (
  process.stderr.write(`\x1b[31m[ERR]\x1b[0m: ${makeMessage(...args)}\n`), 0
);
export const warn = (...args: any[]): unknown => (
  process.stderr.write(`\x1b[33m[WARN]\x1b[0m: ${makeMessage(...args)}\n`), 0
);
