import type { Page } from "@rhighs/gen2e";

export const evalGen2EExpression = async (
  genExpr: string,
  // biome-ignore lint/correctness/noUnusedFunctionParameters: `gen` is referenced by the expression evaluated below
  gen: (task: string, config: { page: Page }) => Promise<unknown>,
  page: Page,
) => {
  if (!page) {
    return;
  }

  // gen2e IL calls gen(task, { page, test }); outside a Playwright test `test` must exist and be null.
  let test = null;
  (() => {
    test = null;
    return test;
  })();

  // biome-ignore lint/security/noGlobalEval: gen2e evaluates generated Playwright expressions by design
  await eval(`(async () => {${genExpr}})()`);
};
