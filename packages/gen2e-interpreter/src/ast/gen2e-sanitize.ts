import { API, AwaitExpression, FileInfo } from "jscodeshift";
import { makeCompiler } from "./compiler";

export const gen2eSanitize = (source: string) =>
  makeCompiler((fileInfo: FileInfo, api: API) => {
    const { j } = api;
    const root = j(fileInfo.source);

    const isGenCall = (awaitExpression: AwaitExpression): boolean => {
      if (awaitExpression.argument?.type === "CallExpression") {
        const { callee } = awaitExpression.argument;
        const callNameMatches =
          callee.type === "Identifier" && callee.name === "gen";
        const hasCorrectArgs =
          awaitExpression.argument.arguments.length === 2 &&
          awaitExpression.argument.arguments[0].type === "Literal" &&
          awaitExpression.argument.arguments[1].type === "ObjectExpression";
        return callNameMatches && hasCorrectArgs;
      }

      return false;
    };

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
          arrowFunction.body.body = body.filter((node) => {
            // rob:
            // this matches straight await expression to gen('some task', { page, test })
            if (
              node.type === "ExpressionStatement" &&
              node.expression.type === "AwaitExpression" &&
              isGenCall(node.expression)
            ) {
              return true;
            }

            // rob:
            // this matches straight await expression to gen('some task', { page, test }) inside a call expression
            // e.g. used with expect or other functions, if this matches throw an error
            if (
              node.type === "ExpressionStatement" &&
              node.expression.type === "CallExpression" &&
              node.expression.arguments?.length > 0 &&
              node.expression.arguments[0].type === "AwaitExpression" &&
              isGenCall(node.expression.arguments[0])
            ) {
              // FIXME: this needs to be handled properly, maybe find a way to structurally reform this outside of this step.
              //        e.g. extract the call to gen into a straight await expression and discard the call to the caller here.
              throw new Error(
                "Gen2ESanitize gen2e code error, cannot sanitize gen2e calls as arguement to other call expressions"
              );
            }

            // rob:
            // this matches calls to gen that are done in the right hand of a variable declation.
            // Matches let, const and var
            // e.g. const value = gen('some task', { page, test })
            if (
              node.type === "VariableDeclaration" &&
              node.declarations[0].type === "VariableDeclarator" &&
              node.declarations[0].init?.type === "AwaitExpression" &&
              isGenCall(node.declarations[0].init)
            ) {
              return true;
            }

            return false;
          });
        }
      });

    return root.toSource();
  })(source);
