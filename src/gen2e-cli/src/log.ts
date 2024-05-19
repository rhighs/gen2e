const makeMessage = (...args: any[]): string =>
  args
    .map((arg) =>
      typeof arg === "object" ? JSON.stringify(arg, null, 2) : arg
    )
    .join(" ");

export const info = (...args: any[]): unknown => (
  process.stderr.write(
    `\x1b[32m[GEN2E.CLI-INFO]\x1b[0m: ${makeMessage(...args)}\n`
  ),
  0
);

export const err = (...args: any[]): unknown => (
  process.stderr.write(
    `\x1b[31m[GEN2E.CLI-ERR]\x1b[0m: ${makeMessage(...args)}\n`
  ),
  0
);

export const warn = (...args: any[]): unknown => (
  process.stderr.write(
    `\x1b[33m[GEN2E.CLI-WARN]\x1b[0m: ${makeMessage(...args)}\n`
  ),
  0
);

export const debug = (...args: any): unknown => (
  process.stdout.write(
    `\x1b[94m[GEN2E.CLI-DEBUG]\x1b[0m: ${makeMessage(...args)}\n`
  ),
  0
);
