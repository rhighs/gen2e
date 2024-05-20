import { API, FileInfo } from "jscodeshift";
import { makeCompiler } from "./compiler";
import { debug } from "../log";

export const compile = (source: string) =>
  makeCompiler((fileInfo: FileInfo, api: API) => {
    const { j } = api;
    const root = j(fileInfo.source);

    root
      .find(j.CallExpression, {
        callee: {
          type: "MemberExpression",
          object: { name: "gen" },
          property: { name: "test" },
        },
      })
      .forEach((path) => {
        const arrowFunction = path.node.arguments[0];
        if (
          arrowFunction &&
          arrowFunction.type === "ArrowFunctionExpression" &&
          arrowFunction.body.type === "BlockStatement"
        ) {
          const body = arrowFunction.body.body;

          // rob: filter out nodes that are not 'await gen("...")' calls
          arrowFunction.body.body = body.filter((node) => {
            if (
              node.type === "ExpressionStatement" &&
              node.expression.type === "AwaitExpression"
            ) {
              if (node.expression.argument?.type === "CallExpression") {
                const { callee } = node.expression.argument;
                // rob: match call ident `gen`
                const callNameMatches =
                  callee.type === "Identifier" && callee.name === "gen";
                // rob: match args `gen("Literal", { <object> })`

                const hasCorrectArgs =
                  node.expression.argument.arguments.length === 2 &&
                  node.expression.argument.arguments[0].type === "Literal" &&
                  node.expression.argument.arguments[1].type ===
                    "ObjectExpression";
                return callNameMatches && hasCorrectArgs;
              }
            }

            return false;
          });
        }
      });

    return root.toSource();
  })(source);
