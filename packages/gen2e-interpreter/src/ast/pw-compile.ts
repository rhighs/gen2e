import { API, FileInfo } from "jscodeshift";
import { StaticStore, FSStaticStore } from "@rhighs/gen2e";
import { Gen2ECompileFunction, makeCompiler } from "./compiler";
import { Gen2ELogger } from "@rhighs/gen2e-logger";

const transformGenCall = (
  j: any,
  root: any,
  store: StaticStore,
  logger?: Gen2ELogger
) => {
  let titleWasSet = false;

  root
    .find(j.CallExpression, {
      callee: { name: "test" },
      arguments: [{ type: "Literal" }],
    })
    .forEach((testPath: any) => {
      const firstArg = testPath.node.arguments[0];
      const testTitle =
        firstArg.type === "Literal" ? firstArg.value : undefined;

      if (testTitle) {
        j(testPath)
          .find(j.AwaitExpression, {
            argument: {
              callee: { type: "Identifier", name: "gen" },
              arguments: (args: any) =>
                args.length === 2 &&
                (args[0].type === "Literal" ||
                  args[0].type === "StringLiteral" ||
                  args[0].type === "TemplateLiteral") &&
                args[1].type === "ObjectExpression",
            },
          })
          .replaceWith((path: any) => {
            if (path.node.argument) {
              const genFirstArg =
                path.node.argument.type === "CallExpression"
                  ? path.node.argument.arguments[0]
                  : undefined;
              const genArg =
                genFirstArg?.type === "TemplateLiteral"
                  ? genFirstArg.quasis[0].value.raw
                  : genFirstArg?.type === "Literal" ||
                    genFirstArg?.type === "StringLiteral"
                  ? genFirstArg.value
                  : undefined;

              if (genArg) {
                const ident = store.makeIdent(
                  testTitle as string,
                  genArg as string
                );
                const code = store.fetchStatic(ident);

                if (code) {
                  // if no expression is found for replacement, skip it
                  if (!code.expression) {
                    const message = `got undefined or empty expression for ident`;
                    if (logger) {
                      logger.error(message, { ident });
                    }
                    return;
                  }

                  if (
                    testPath.node.arguments[0].type === "Literal" &&
                    !titleWasSet
                  ) {
                    testPath.node.arguments[0].value = `gen2e:compiled-output - ${
                      testTitle as string
                    }`;
                    titleWasSet = true;
                  }

                  const parsedInput = j(code.expression);
                  const arrowFunction = parsedInput
                    .find(j.ArrowFunctionExpression)
                    .get().node;
                  const body = arrowFunction.body;

                  const internalArrowFunction = j.arrowFunctionExpression(
                    [],
                    body,
                    true
                  );
                  internalArrowFunction.async = true;

                  return j.awaitExpression(
                    j.callExpression(
                      j.parenthesizedExpression(internalArrowFunction),
                      []
                    )
                  );
                }
              }
            }

            return null;
          });
      }
    });
};

const transformGenTest = (j: any, root: any) => {
  root
    .find(j.CallExpression, {
      callee: {
        type: "MemberExpression",
        object: { name: "gen" },
        property: { name: "test" },
      },
      arguments: [
        {
          type: "ArrowFunctionExpression",
          async: true,
          params: [{ type: "ObjectPattern" }],
        },
      ],
    })
    .replaceWith((path: any) => {
      const arrowFunction = path.node.arguments[0];
      if (arrowFunction && arrowFunction.type === "ArrowFunctionExpression") {
        const params = arrowFunction.params;
        if (
          params.length === 1 &&
          params[0].type === "ObjectPattern" &&
          params[0].properties.some(
            (prop: any) =>
              prop.type === "Property" &&
              prop.key.type === "Identifier" &&
              prop.key.name === "page"
          )
        ) {
          const newParams = j.objectPattern(
            params[0].properties.filter(
              (prop: any) =>
                prop.type === "Property" &&
                prop.key.type === "Identifier" &&
                prop.key.name === "page"
            )
          );
          const result = j.arrowFunctionExpression(
            [newParams],
            arrowFunction.body,
            true
          );
          result.async = true;
          return result;
        }
      }
      return path.node;
    });
};

const transform = (
  fileInfo: FileInfo,
  api: API,
  store: StaticStore,
  logger?: Gen2ELogger
): string => {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  transformGenCall(j, root, store, logger);
  transformGenTest(j, root);
  return root.toSource();
};

const compiler = (
  store: StaticStore,
  logger?: Gen2ELogger
): Gen2ECompileFunction =>
  makeCompiler((fileInfo: FileInfo, api: API) =>
    transform(fileInfo, api, store, logger)
  );

/**
 * Translates source code from the gen2e library into native playwright JavaScript code.
 *
 * This function processes the given source code to replace gen2e IL syntax with
 * equivalent native Playwright expressions assumed to be fetched from a static store, where to code is at.
 * It performs the following transformations:
 *
 * 1. Replaces calls to `gen("<task>", { page, test })` with corresponding static Playwright expressions
 * 2. Edits test titles to indicate the compilation output process
 * 3. Converts `gen.test(({ page, gen }) => { ... })` calls into native Playwright test expressions,
 *    removing dependencies on the gen2e library
 *
 * @param {string} source - The source code to be compiled.
 * @param {StaticStore} store - The static code store used to fetch playwright expressions.
 * @returns {string} compile step output.
 */
export const pwCompile = (
  source: string,
  store: StaticStore = FSStaticStore,
  logger?: Gen2ELogger
): string => compiler(store, logger)(source);
