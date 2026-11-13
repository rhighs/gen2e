import { describe, expect, test } from "bun:test";
import {
  _MARGIN,
  countTokenApprox,
  fitsContext,
  maxCharactersApprox,
  tokenLimits,
} from "../../src";

const limit100 = () => ({ context: 100, maxOut: 100 });

describe("context window", () => {
  test("countTokenApprox scales with text length", () => {
    expect(countTokenApprox("abcdefghij")).toBeCloseTo(10 / Math.E + _MARGIN);
  });

  test("fitsContext compares text length with the approximate character budget", () => {
    expect(fitsContext("m", "A".repeat(50), limit100)).toBe(true);
    expect(fitsContext("m", "A".repeat(1000), limit100)).toBe(false);
  });

  test("maxCharactersApprox converts the token budget to characters", () => {
    expect(maxCharactersApprox("m", limit100)).toBeCloseTo((100 - _MARGIN) * Math.E);
  });

  test("tokenLimits falls back to a large window for unknown models", () => {
    expect(tokenLimits("gpt-4o-mini").context).toBeGreaterThan(0);
    expect(tokenLimits("someone-elses-model")).toEqual({ context: 128_000, maxOut: 16_384 });
  });
});
