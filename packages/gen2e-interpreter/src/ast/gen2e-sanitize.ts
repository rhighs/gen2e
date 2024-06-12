import {
  API,
  MemberExpression,
  AwaitExpression,
  FileInfo,
  CallExpression,
} from "jscodeshift";
import { makeCompiler } from "./compiler";
import { Gen2ELogger } from "@rhighs/gen2e-logger";

const isGenCall = (e: AwaitExpression | CallExpression): boolean => {
  if (e.type === "AwaitExpression" && e.argument?.type === "CallExpression") {
    const { callee } = e.argument;
    const callNameMatches =
      callee.type === "Identifier" && callee.name === "gen";
    const hasCorrectArgs =
      e.argument.arguments.length === 2 &&
      (e.argument.arguments[0].type === "Literal" ||
        e.argument.arguments[0].type === "StringLiteral" ||
        e.argument.arguments[0].type === "TemplateLiteral") &&
      e.argument.arguments[1].type === "ObjectExpression";
    return callNameMatches && hasCorrectArgs;
  } else if (e.type === "CallExpression") {
    const { callee } = e;
    const callNameMatches =
      callee.type === "Identifier" && callee.name === "gen";
    const hasCorrectArgs =
      e.arguments.length === 2 &&
      (e.arguments[0].type === "Literal" ||
        e.arguments[0].type === "StringLiteral" ||
        e.arguments[0].type === "TemplateLiteral") &&
      e.arguments[1].type === "ObjectExpression";
    return callNameMatches && hasCorrectArgs;
  }
  return false;
};

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

const filterNode = (node: any): boolean => {
  const maybeChainedV =
    node.type === "ExpressionStatement" &&
    node.expression.type === "CallExpression" &&
    node.expression.callee.type === "MemberExpression"
      ? resolveChainedMemberCall(node.expression.callee)
      : undefined;

  if (node.type === "IfStatement") {
    node.consequent.body.filter(filterNode)
    return true;
  }

  if (
    (node.type === "ExpressionStatement" &&
      node.expression.type === "CallExpression" &&
      node.expression.arguments?.length > 0 &&
      node.expression.arguments[0].type === "AwaitExpression" &&
      isGenCall(node.expression.arguments[0])) ||
    (node.type === "ExpressionStatement" &&
      node.expression.type === "AwaitExpression" &&
      node.expression.argument?.type === "CallExpression" &&
      node.expression.argument.arguments[0]?.type === "AwaitExpression" &&
      isGenCall(node.expression.argument.arguments[0])) ||
    (maybeChainedV &&
      maybeChainedV.arguments.length > 0 &&
      maybeChainedV.arguments[0].type === "AwaitExpression" &&
      maybeChainedV.arguments[0].argument?.type === "CallExpression" &&
      isGenCall(maybeChainedV.arguments[0]))
  ) {
    throw new Error(
      "Gen2ESanitize gen2e code error, cannot sanitize gen2e calls as argument to other call expressions"
    );
  }

  if (
    node.type === "VariableDeclaration" &&
    node.declarations[0].type === "VariableDeclarator" &&
    node.declarations[0].init?.type === "AwaitExpression" &&
    isGenCall(node.declarations[0].init)
  ) {
    return true;
  }

  if (
    node.type === "ExpressionStatement" &&
    node.expression.type === "AwaitExpression" &&
    isGenCall(node.expression)
  ) {
    return true;
  }

  return false;
};

const sanitizeGenCalls = (root: any, j: any): void => {
  root
    .find(j.CallExpression, {
      callee: {
        type: "MemberExpression",
        object: { name: "gen" },
        property: { name: "test" },
      },
    })
    .forEach((path: any) => {
      const arrowFunction = path.node.arguments[0];
      if (
        arrowFunction &&
        arrowFunction.type === "ArrowFunctionExpression" &&
        arrowFunction.body.type === "BlockStatement"
      ) {
        const body = arrowFunction.body.body;
        arrowFunction.body.body = body.filter(filterNode);
      }
    });
};

export const gen2eSanitize = (source: string) =>
  makeCompiler((fileInfo: FileInfo, api: API, logger?: Gen2ELogger) => {
    const { j } = api;
    const root = j(fileInfo.source);
    sanitizeGenCalls(root, j);
    return root.toSource();
  })(source);
