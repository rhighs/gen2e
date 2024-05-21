import { GenFunction, Page } from "@rhighs/gen2e";
import { err } from "../log";

export const evalGen2EExpression = async (
  genExpr: string,
  gen: GenFunction,
  page: Page
) => {
  try {
    if (page) {
      // rob: don't let the compiler strip this away
      let test = null;
      (() => {
        test = null;
        return test;
      })();

      const expr = `(async () => {${genExpr}})()`;
      await eval(expr);
    }
  } catch (error) {
    err("eval() error", error.message);
  }
};
