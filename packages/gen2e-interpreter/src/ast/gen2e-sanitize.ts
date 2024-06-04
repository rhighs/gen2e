import {
  API,
  MemberExpression,
  AwaitExpression,
  FileInfo,
  CallExpression,
} from "jscodeshift";
import { makeCompiler } from "./compiler";
import { Gen2ELogger } from "@rhighs/gen2e-logger";

export const gen2eSanitize = (source: string) =>
  makeCompiler((fileInfo: FileInfo, api: API, logger?: Gen2ELogger) => {
    const { j } = api;
    const root = j(fileInfo.source);

    const isGenCall = (e: AwaitExpression | CallExpression): boolean => {
      if (e.type === "AwaitExpression") {
        if (e.argument?.type === "CallExpression") {
          const { callee } = e.argument;
          const callNameMatches =
            callee.type === "Identifier" && callee.name === "gen";
          const hasCorrectArgs =
            e.argument.arguments.length === 2 &&
            e.argument.arguments[0].type === "Literal" &&
            e.argument.arguments[1].type === "ObjectExpression";
          return callNameMatches && hasCorrectArgs;
        }
      } else if (e.type === "CallExpression") {
        const { callee } = e;
        const callNameMatches =
          callee.type === "Identifier" && callee.name === "gen";
        const hasCorrectArgs =
          e.arguments.length === 2 &&
          e.arguments[0].type === "Literal" &&
          e.arguments[1].type === "ObjectExpression";
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
            // this matches straight await expression to gen('some task', { page, test }) inside a call expression

            const resolveChainedMemberCall = (
              e: MemberExpression
            ): CallExpression | undefined => {
              if (
                e.object.type === "CallExpression" &&
                e.object.callee.type === "MemberExpression"
              ) {
                return resolveChainedMemberCall(e.object.callee);
              }

              if (e.object.type === "CallExpression") {
                return e.object;
              }

              if (
                e.object.type === "AwaitExpression" &&
                e.object.argument?.type === "CallExpression"
              ) {
                return e.object.argument;
              }

              return undefined;
            };

            const maybeChainedV =
              node.type === "ExpressionStatement" &&
              node.expression.type === "CallExpression" &&
              node.expression.callee.type === "MemberExpression"
                ? resolveChainedMemberCall(node.expression.callee)
                : undefined;

            // FIXME: this needs to be handled properly, maybe find a way to structurally reform this outside of this step.
            //        e.g. extract the call to gen into a straight await expression and discard the call to the caller here.
            //        atm. this is just a messy thing to cover expect(await gen(...)), expect(await gen(...))...toBe() or any other like
            //        await someFunc(await gen(...))
            if (
              (node.type === "ExpressionStatement" &&
                node.expression.type === "CallExpression" &&
                node.expression.arguments?.length > 0 &&
                node.expression.arguments[0].type === "AwaitExpression" &&
                isGenCall(node.expression.arguments[0])) ||
              (node.type === "ExpressionStatement" &&
                node.expression.type === "AwaitExpression" &&
                node.expression.argument?.type === "CallExpression" &&
                node.expression.argument.arguments[0]?.type ===
                  "AwaitExpression" &&
                isGenCall(node.expression.argument.arguments[0])) ||
              (maybeChainedV &&
                maybeChainedV.arguments.length > 0 &&
                maybeChainedV.arguments[0].type === "AwaitExpression" &&
                maybeChainedV.arguments[0].argument?.type ===
                  "CallExpression" &&
                isGenCall(maybeChainedV.arguments[0]))
            ) {
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

            // rob:
            // this matches straight await expression to gen('some task', { page, test })
            if (
              node.type === "ExpressionStatement" &&
              node.expression.type === "AwaitExpression" &&
              isGenCall(node.expression)
            ) {
              return true;
            }

            return false;
          });
        }
      });

    return root.toSource();
  })(source);
