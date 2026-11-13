import { describe, expect, test } from "bun:test";
import { codeValidationTool, createValidationTools, formatValidationTool } from "../../src";

describe("validation tools", () => {
  test("format tool rejects markdown fences", async () => {
    const t = formatValidationTool();

    expect(await t.execute({ code: "```js\nx\n```" }, {})).toMatchObject({ isError: true });
    expect(await t.execute({ code: "await x()" }, {})).toEqual({ output: "format ok" });
  });

  test("javascript tool parses the code", async () => {
    const t = codeValidationTool("javascript");

    expect(await t.execute({ code: "await page.click('#a')" }, {})).toEqual({ output: "code ok" });
    expect(await t.execute({ code: "await (" }, {})).toMatchObject({ isError: true });
  });

  test("json tool parses the code", async () => {
    const t = codeValidationTool("json");

    expect(await t.execute({ code: '{"a":1}' }, {})).toEqual({ output: "code ok" });
    expect(await t.execute({ code: "{a:1}" }, {})).toMatchObject({ isError: true });
  });

  test("tools reject input without code", async () => {
    expect(await formatValidationTool().execute({}, {})).toMatchObject({ isError: true });
  });

  test("the set depends on the language", () => {
    expect(createValidationTools("javascript").map((t) => t.name)).toEqual([
      "format_validation_tool",
      "code_validation_tool",
    ]);
    expect(createValidationTools("text").map((t) => t.name)).toEqual(["format_validation_tool"]);
  });
});
