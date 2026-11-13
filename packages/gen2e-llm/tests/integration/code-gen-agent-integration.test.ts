import { describe, expect, test } from "bun:test";
import { createCodeGenAgent } from "../../src";

const describeIntegration = process.env.OPENAI_API_KEY ? describe : describe.skip;

describeIntegration("createCodeGenAgent against a live model", () => {
  test("generates javascript that passes validation", async () => {
    const agent = createCodeGenAgent(
      "You write javascript. Validate your code with the tools, then answer with the code only.",
      process.env.GEN2E_MODEL ?? "gpt-4o-mini",
    );

    const res = await agent({ task: "log hello world to the console" });

    expect(res.type).toBe("success");
  }, 30_000);
});
