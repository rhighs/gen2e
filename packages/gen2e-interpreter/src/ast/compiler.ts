import { Gen2ELogger, makeLogger } from "@rhighs/gen2e-logger";
import jscodeshift, { API, FileInfo } from "jscodeshift";

const DEBUG_AST_UTILS = !!process.env.GEN2EI_DEBUG_AST;

export type Gen2ECompileFunction = (source: string) => string;
export type Gen2ECompilerTransformer = (
  fileInfo: FileInfo,
  api: API,
  logger?: Gen2ELogger
) => string;

export const makeCompiler =
  (
    transformer: Gen2ECompilerTransformer,
    _logger?: Gen2ELogger
  ): Gen2ECompileFunction =>
  (source: string): string => {
    const logger = makeLogger("GEN2E-AST-COMPILER");
    if (_logger) {
      logger.config(_logger);
    }

    if (DEBUG_AST_UTILS) {
      logger.info("compiling source:\n", source);
    }
    const out = transformer(
      {
        path: "",
        source: source,
      },
      {
        j: jscodeshift,
        jscodeshift: jscodeshift,
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
