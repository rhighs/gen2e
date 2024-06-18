import { Gen2ELogger, makeLogger } from "@rhighs/gen2e-logger";
import jscodeshift, { API, FileInfo } from "jscodeshift";
import { parse as babelParse } from "@babel/parser";

const DEBUG_AST_UTILS = !!process.env.GEN2EI_DEBUG_AST;

export type Gen2ETransformFunction<R> = (source: string) => R;
export type Gen2ETransformer<R> = (
  fileInfo: FileInfo,
  api: API,
  logger?: Gen2ELogger
) => R;

export const makeTransformer =
  <R>(
    transformer: Gen2ETransformer<R>,
    _logger?: Gen2ELogger
  ): Gen2ETransformFunction<R> =>
  (source: string): R => {
    const logger = makeLogger("GEN2E-AST-TRANSFORMER");
    if (_logger) {
      logger.config(_logger);
    }

    if (DEBUG_AST_UTILS) {
      logger.info("compiling source:\n", source);
    }

    const parser = {
      parse: (source: string) =>
        babelParse(source, {
          sourceType: "unambiguous",
          plugins: ["typescript"],
        }),
    };

    const out = transformer(
      {
        path: "",
        source: source,
      },
      {
        j: jscodeshift.withParser(parser),
        jscodeshift: jscodeshift.withParser(parser),
        stats: () => {},
        report: () => {},
      },
      logger
    );

    if (DEBUG_AST_UTILS) {
      logger.info("compilation ended successfully, transformer result:\n", out);
    }
    return out;
  };
