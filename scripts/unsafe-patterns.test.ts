import { describe, expect, test } from "bun:test";
import { type Baseline, compareToBaseline, countUnsafePatterns } from "./unsafe-patterns";

const counts = (any = 0, forcedCast = 0, nonNull = 0, emptyCatch = 0) => ({
  any,
  forcedCast,
  nonNull,
  emptyCatch,
});

describe("countUnsafePatterns", () => {
  test("counts each unsafe pattern once", () => {
    const src = `
      const a: any = 1;
      const b = a as unknown as string;
      const c = maybe!.value;
      try { run(); } catch {}
    `;

    expect(countUnsafePatterns(src)).toEqual(counts(1, 1, 1, 1));
  });

  test("ignores the safe look-alikes", () => {
    const src = `
      const a: unknown = 1;
      const b = a as string;
      const c = x !== y && !z;
      try { run(); } catch (err) { log(err); }
    `;

    expect(countUnsafePatterns(src)).toEqual(counts());
  });

  test("counts a catch that holds only a comment as empty", () => {
    expect(countUnsafePatterns("try { run(); } catch { /* nothing */ }")).toEqual(
      counts(0, 0, 0, 1),
    );
  });
});

describe("compareToBaseline", () => {
  const baseline: Baseline = { core: counts(2, 0, 0, 0) };

  test("passes when every count equals the baseline", () => {
    expect(compareToBaseline({ core: counts(2) }, baseline)).toEqual([]);
  });

  test("fails when a count rises by one", () => {
    expect(compareToBaseline({ core: counts(3) }, baseline)).toEqual([
      "core: any rose from 2 to 3; fix the new occurrence",
    ]);
  });

  test("fails when a count falls, so the baseline gets tightened", () => {
    expect(compareToBaseline({ core: counts(1) }, baseline)).toEqual([
      "core: any fell from 2 to 1; run with --write to tighten",
    ]);
  });

  test("fails when a package is missing from the baseline", () => {
    expect(compareToBaseline({ core: counts(2), cli: counts() }, baseline)).toEqual([
      "cli: missing from the baseline",
    ]);
  });

  test("fails when the baseline names a package that no longer exists", () => {
    expect(compareToBaseline({}, baseline)).toEqual(["core: in the baseline but not in the tree"]);
  });
});
