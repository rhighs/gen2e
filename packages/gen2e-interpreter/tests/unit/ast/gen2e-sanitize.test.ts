import { describe, expect, test } from "bun:test";
import { gen2eSanitize } from "../../../src";

const testWith = (body: string) => `\
test('t',
  gen.test(async ({ page, gen }) => {
${body}
  })
);`;

const dropped = `
    await someOtherFunction();
    await expect(gen('dropped', { page, test })).resolves.toBe(true);`;

describe("gen2eSanitize", () => {
  test.each([
    [
      "plain calls",
      "    await gen('task 1', { page, test });\n    const r = await gen('task 2', { page, test });",
    ],
    ["template literals", "    await gen(`task ${1}`, { page, test });"],
    ["extra config keys", "    await gen('task 3', { page, test, extra: true });"],
    [
      "calls inside conditionals",
      "    if (true) {\n      await gen('task 1', { page, test });\n    }",
    ],
  ])("keeps gen calls and drops every other call: %s", (_, kept) => {
    expect(gen2eSanitize(testWith(kept + dropped))).toBe(testWith(kept));
  });

  test("throws when a gen call is the argument of another call", () => {
    expect(() =>
      gen2eSanitize(testWith("    expect(await gen('task 1', { page, test })).toBe(true);")),
    ).toThrow();
  });

  test("returns empty source unchanged", () => {
    expect(gen2eSanitize("")).toBe("");
  });
});
