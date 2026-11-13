import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

export type UnsafeCounts = {
  any: number;
  forcedCast: number;
  nonNull: number;
  emptyCatch: number;
};

export type Baseline = Record<string, UnsafeCounts>;

const KINDS: (keyof UnsafeCounts)[] = ["any", "forcedCast", "nonNull", "emptyCatch"];

const zero = (): UnsafeCounts => ({ any: 0, forcedCast: 0, nonNull: 0, emptyCatch: 0 });

const isForcedCast = (node: ts.Node): boolean =>
  ts.isAsExpression(node) &&
  ts.isAsExpression(node.expression) &&
  node.expression.type.kind === ts.SyntaxKind.UnknownKeyword;

export const countUnsafePatterns = (src: string, fileName = "file.ts"): UnsafeCounts => {
  const counts = zero();
  const file = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);

  const visit = (node: ts.Node): void => {
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      counts.any++;
    }
    if (isForcedCast(node)) {
      counts.forcedCast++;
    }
    if (ts.isNonNullExpression(node)) {
      counts.nonNull++;
    }
    if (ts.isCatchClause(node) && node.block.statements.length === 0) {
      counts.emptyCatch++;
    }
    ts.forEachChild(node, visit);
  };

  visit(file);
  return counts;
};

const tsFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && e.name.endsWith(".ts") && !e.name.endsWith(".d.ts"))
    .map((e) => path.join(e.parentPath, e.name));

export const countPackage = (pkgDir: string): UnsafeCounts => {
  const counts = zero();
  const dirs = ["src", "tests"].map((d) => path.join(pkgDir, d));

  for (const dir of dirs) {
    let files: string[];
    try {
      files = tsFiles(dir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        continue;
      }
      throw err;
    }

    for (const f of files) {
      const c = countUnsafePatterns(readFileSync(f, "utf8"), f);
      for (const k of KINDS) {
        counts[k] += c[k];
      }
    }
  }

  return counts;
};

export const compareToBaseline = (actual: Baseline, baseline: Baseline): string[] => {
  const problems: string[] = [];

  for (const pkg of Object.keys(actual)) {
    if (!(pkg in baseline)) {
      problems.push(`${pkg}: missing from the baseline`);
    }
  }

  for (const [pkg, base] of Object.entries(baseline)) {
    const cur = actual[pkg];
    if (!cur) {
      problems.push(`${pkg}: in the baseline but not in the tree`);
      continue;
    }

    for (const k of KINDS) {
      if (cur[k] > base[k]) {
        problems.push(`${pkg}: ${k} rose from ${base[k]} to ${cur[k]}; fix the new occurrence`);
      }
      if (cur[k] < base[k]) {
        problems.push(
          `${pkg}: ${k} fell from ${base[k]} to ${cur[k]}; run with --write to tighten`,
        );
      }
    }
  }

  return problems;
};

const main = (): void => {
  const root = path.resolve(import.meta.dir, "..");
  const baselinePath = path.join(import.meta.dir, "unsafe-baseline.json");
  const pkgs = readdirSync(path.join(root, "packages")).sort();
  const actual: Baseline = Object.fromEntries(
    pkgs.map((p) => [p, countPackage(path.join(root, "packages", p))]),
  );

  if (process.argv.includes("--write")) {
    const baseline: Baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
    const rose = compareToBaseline(actual, baseline).filter((p) => p.includes("rose"));
    if (rose.length > 0) {
      console.error(rose.join("\n"));
      process.exit(1);
    }
    writeFileSync(baselinePath, `${JSON.stringify(actual, null, 2)}\n`);
    return;
  }

  const baseline: Baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  const problems = compareToBaseline(actual, baseline);
  if (problems.length > 0) {
    console.error(`unsafe-patterns guard failed:\n${problems.join("\n")}`);
    process.exit(1);
  }
};

if (import.meta.main) {
  main();
}
