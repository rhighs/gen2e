import {
  API,
  FileInfo,
  JSCodeshift,
  Collection,
  CallExpression,
} from "jscodeshift";
import { makeCompiler } from "./compiler";

const isGenCall = (expression: CallExpression): boolean => {
  const { callee, arguments: args } = expression;
  return (
    callee.type === "MemberExpression" &&
    callee.object.name === "gen" &&
    callee.property.type === "Identifier" &&
    callee.property.name === "test" &&
    args.length === 2 &&
    args[0].type === "Literal" &&
    typeof args[0].value === "string" &&
    args[1].type === "ObjectExpression"
  );
};

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

          // Filter out nodes that are not 'await gen("...")' calls
          const filteredBody = body.filter((node) => {
            if (
              node.type === "ExpressionStatement" &&
              node.expression.type === "AwaitExpression"
            ) {
              const { callee } = node.expression.argument;
              return (
                callee.type === "Identifier" &&
                callee.name === "gen" &&
                node.expression.argument.arguments.length === 2 &&
                node.expression.argument.arguments[0].type === "Literal" &&
                node.expression.argument.arguments[1].type ===
                  "ObjectExpression"
              );
            }
            return false;
          });

          // Replace the body with the filtered body
          arrowFunction.body.body = filteredBody;
        }
      });

    return root.toSource();
  })(source);
