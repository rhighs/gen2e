import { describe, expect, jest, test } from "bun:test";
import { type Gen2EGen2ECodeGenResult, generateGen2ECode } from "../../../src";

describe("generateGen2ECode", () => {
  test.each<Gen2EGen2ECodeGenResult>([
    { type: "success", result: "await gen('x', { page, test });" },
    { type: "error", errorMessage: "An error occurred" },
  ])("passes the task to the agent and returns its result: %o", async (res) => {
    const agent = jest.fn().mockResolvedValue(res);
    const hooks = {};

    const out = await generateGen2ECode({
      agent,
      task: "Generate a test script",
      codeContext: "Test context",
      options: { model: "gpt-4o-mini", debug: false },
      hooks,
    });

    expect(out).toEqual(res);
    expect(agent).toHaveBeenCalledWith(
      {
        task: "Generate a test script",
        codeContext: expect.stringContaining("Test context"),
        options: { model: "gpt-4o-mini", debug: false },
      },
      hooks,
    );
  });
});
