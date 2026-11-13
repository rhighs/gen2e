import { describe, expect, test } from "bun:test";
import { fillVars, parsePlain, stepTask } from "../../src/runner/plain";

describe("parsePlain", () => {
  test("keeps line numbers, skips blanks and comments, and reads the keywords", () => {
    const steps = parsePlain(
      "# login\n\nopen /login\n  type {{user}} in the email field\nASSERT the dashboard is shown\n",
    );

    expect(steps).toEqual([
      { line: 3, text: "open /login", kind: "open", arg: "/login" },
      {
        line: 4,
        text: "type {{user}} in the email field",
        kind: "do",
        arg: "type {{user}} in the email field",
      },
      {
        line: 5,
        text: "ASSERT the dashboard is shown",
        kind: "assert",
        arg: "the dashboard is shown",
      },
    ]);
  });

  test("a keyword alone is an ordinary step", () => {
    expect(parsePlain("open")[0]?.kind).toBe("do");
  });

  test("an assert step is cached under the same task as ai.assert", () => {
    const [step] = parsePlain("assert the cart is empty");

    expect(step && stepTask(step)).toContain(
      "Check whether this holds on the page: the cart is empty",
    );
  });
});

describe("fillVars", () => {
  test("replaces known names and leaves unknown ones", () => {
    expect(fillVars("/u/{{ id }}/{{tab}}", { id: "7" })).toBe("/u/7/{{tab}}");
  });
});
