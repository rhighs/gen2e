import { classifyEvalError } from "../../src/eval-error";

describe("classifyEvalError", () => {
  test.each([
    ["strict mode violation: locator('a') resolved to 2 elements", "locator-drift"],
    [
      "locator.click: Timeout 30000ms exceeded. Call log: - waiting for locator('button')",
      "locator-drift",
    ],
    [
      "page.waitForSelector: Timeout 30000ms exceeded. Call log: - waiting for selector `#submit`",
      "locator-drift",
    ],
    ["Target closed", "navigation"],
    ["Execution context was destroyed, most likely because of a navigation", "navigation"],
    ["Test timeout of 30000ms exceeded while running test", "timeout"],
    ["page.click: Timeout 30000ms exceeded.", "timeout"],
    ["expect(received).toBe(expected)", "assertion"],
    ["expected 3 to be 4", "assertion"],
    ["boom while doing something else", "unknown"],
  ])("classifies %s as %s", (message, expected) => {
    expect(classifyEvalError(new Error(message))).toBe(expected);
  });

  test("handles non-error values without throwing", () => {
    expect(classifyEvalError("Target closed")).toBe("navigation");
    expect(classifyEvalError(undefined)).toBe("unknown");
    expect(classifyEvalError(null)).toBe("unknown");
    expect(classifyEvalError({ message: "strict mode violation" })).toBe("locator-drift");
  });
});
