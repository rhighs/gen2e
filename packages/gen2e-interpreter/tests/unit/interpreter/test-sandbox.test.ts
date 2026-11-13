import { describe, expect, jest, mock, test } from "bun:test";
import type { GenType, Page, StaticStore, TestFunction } from "@rhighs/gen2e";
import { sandboxEval } from "../../../src";

mock.module("../../../src/env", () => ({
  default: { SANDBOX_DEBUG: false },
}));

describe("sandboxEval", () => {
  const page = {} as Page;
  const expression = "(async () => { await page.goto('https://example.com'); })";
  const store: StaticStore = {
    makeIdent: (title, task) => `${title}/${task}`,
    fetchStatic: (ident) => (ident === "gen test/task 1" ? { expression } : undefined),
    makeStatic: jest.fn(),
  };

  const fakeGen = {
    test: (fn: TestFunction) => (fixtures, info) =>
      fn(
        {
          ...fixtures,
          gen: async (task, _config, _options, evalCode) =>
            evalCode?.(
              store.fetchStatic(store.makeIdent(info.title, task))?.expression ?? "",
              fixtures.page,
            ),
        },
        info,
      ),
  } as GenType;

  test.each([
    ["", "starts at column 0"],
    ["\n  ", "starts after a newline"],
  ])("runs each gen call through the injected eval when the source %#: %s", async (lead) => {
    const evalPwCode = jest.fn().mockResolvedValue(undefined);
    const src = `${lead}test('gen test',
  gen.test(async ({ page, gen }) => {
    await gen('task 1', { page, test });
  })
);`;

    await sandboxEval(src, page, store, undefined, undefined, evalPwCode, fakeGen);

    expect(evalPwCode).toHaveBeenCalledWith(expression, page);
  });
});
