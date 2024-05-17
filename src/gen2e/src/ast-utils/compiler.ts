import jscodeshift, { API, FileInfo } from "jscodeshift";
import { info } from "../log";

const DEBUG_AST_UTILS = !!process.env.GEN2E_DEBUG_AST;

export type Gen2ECompileFunction = (source: string) => string;
export type Gen2ECompilerTransformer = (fileInfo: FileInfo, api: API) => string

export const makeCompiler =
  (
    transformer: Gen2ECompilerTransformer
  ): Gen2ECompileFunction =>
  (source: string): string => {
    if (DEBUG_AST_UTILS) {
      info("compiling source:\n", source);
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
      }
    );
    if (DEBUG_AST_UTILS) {
      info("compilation ended successfully, transformer result:\n", out);
    }
    return out;
  };
