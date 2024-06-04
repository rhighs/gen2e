import { GenFunction, Page } from "@rhighs/gen2e";
import { Gen2ELogger, makeLogger } from "@rhighs/gen2e-logger";

const EVALERR_DBG = !!process.env.GEN2EI_EVALERR_DBG;

const evalLogger = makeLogger("GEN2E-INTEPRETER-EVAL");

export const evalGen2EExpression = async (
  genExpr: string,
  gen: GenFunction,
  page: Page,
  logger?: Gen2ELogger
) => {
  const _logger = evalLogger;
  if (logger) {
    _logger.config(logger);
  }
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
    if (EVALERR_DBG) {
      _logger.error("eval() error", error.message, error.stack);
    }
  }
};
