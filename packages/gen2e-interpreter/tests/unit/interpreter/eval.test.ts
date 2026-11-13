import { describe, expect, jest, test } from "bun:test";
import type { Page } from "@rhighs/gen2e";
import { evalGen2EExpression } from "../../../src";

describe("evalGen2EExpression", () => {
  const page = {} as Page;

  test("calls gen with the arguments in the expression", async () => {
    const gen = jest.fn().mockResolvedValue(undefined);

    await evalGen2EExpression("await gen('task', { page });", gen, page);

    expect(gen).toHaveBeenCalledWith("task", { page });
  });

  test("swallows errors thrown by the expression", async () => {
    const gen = jest.fn().mockResolvedValue(undefined);

    await expect(
      evalGen2EExpression("await gen('task', { page }); throw new Error('x');", gen, page),
    ).resolves.toBeUndefined();
  });

  test("does nothing without a page", async () => {
    const gen = jest.fn();

    await evalGen2EExpression("await gen('task', { page });", gen, null as unknown as Page);

    expect(gen).not.toHaveBeenCalled();
  });
});
