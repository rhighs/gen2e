import { API, FileInfo } from "jscodeshift";
import { StaticStore, FSStaticStore } from "@rhighs/gen2e";
import { Gen2ECompileFunction, makeCompiler } from "./compiler";

const compiler = (store: StaticStore): Gen2ECompileFunction => {
  const transform = (fileInfo: FileInfo, api: API): string => {
    const j = api.jscodeshift;
    const root = j(fileInfo.source);

    let titleWasSet = false;

    // rob: replace gen("<task>", { page, test }) witgh the static playwright
    //      expressions
    root
      .find(j.CallExpression, {
        callee: { name: "test" },
        arguments: [{ type: "Literal" }],
      })
      .forEach((testPath) => {
        const firstArg = testPath.node.arguments[0];
        const testTitle =
          firstArg.type === "Literal" ? firstArg.value : undefined;
        if (testTitle) {
          j(testPath)
            .find(j.AwaitExpression, {
              argument: {
                callee: { type: "Identifier", name: "gen" },
                arguments: (args) =>
                  args.length === 2 &&
                  args[0].type === "Literal" &&
                  args[1].type === "ObjectExpression",
              },
            })
            .replaceWith((path) => {
              if (path.node.argument) {
                const genFirstArg =
                  path.node.argument.type === "CallExpression"
                    ? path.node.argument.arguments[0]
                    : undefined;
                const genArg =
                  genFirstArg?.type === "Literal"
                    ? genFirstArg.value
                    : undefined;

                if (genArg) {
                  const ident = store.makeIdent(
                    testTitle as string,
                    genArg as string
                  );
                  const code = store.fetchStatic(ident);

                  if (code) {
                    if (!code.expression) {
                      throw new Error(
                        "got undefined or empty expression for " + ident
                      );
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

    // rob: replace gen.test(({ page, gen }) => { ... }) with a native playwright
    //      test expression, removing all dependencies from the gen IL library
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
      .replaceWith((path) => {
        const arrowFunction = path.node.arguments[0];
        if (arrowFunction && arrowFunction.type === "ArrowFunctionExpression") {
          const params = arrowFunction.params;
          if (
            params.length === 1 &&
            params[0].type === "ObjectPattern" &&
            params[0].properties.some(
              (prop) =>
                prop.type === "Property" &&
                prop.key.type === "Identifier" &&
                prop.key.name === "page"
            )
          ) {
            const newParams = j.objectPattern(
              params[0].properties.filter(
                (prop) =>
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

    return root.toSource();
  };

  return makeCompiler(transform);
};

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
export const compile = (
  source: string,
  store: StaticStore = FSStaticStore
): string => compiler(store)(source);
