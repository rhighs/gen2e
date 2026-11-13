import { parseScript } from "esprima";

const FORBIDDEN_NAMES = new Set([
  "process",
  "require",
  "module",
  "exports",
  "global",
  "globalThis",
  "Function",
  "eval",
]);

type EsNode = {
  type: string;
  name?: string;
  computed?: boolean;
  property?: { type: string; name?: string; value?: unknown };
};

export const validateJSCode = (code: string): boolean => {
  try {
    parseScript(`(async () => {${code}})`);
    return true;
  } catch (e) {
    if (process.env.GEN2E_SV_LOG_ERR) {
      console.error("js error", e, `got code ${code}`);
    }
    return false;
  }
};

// A denylist, not a sandbox: it stops generated code from casually reaching Node, but determined code can still get around it.
export const findForbiddenJS = (code: string): string | undefined => {
  let found: string | undefined;

  try {
    parseScript(`(async () => {${code}})`, {}, (node: EsNode) => {
      if (found) {
        return;
      }
      if (node.type === "Identifier" && node.name && FORBIDDEN_NAMES.has(node.name)) {
        found = node.name;
      }
      if (node.type === "MemberExpression" && node.property) {
        const key = node.computed ? node.property.value : node.property.name;
        if (key === "constructor" || key === "__proto__") {
          found = String(key);
        }
      }
    });
  } catch {
    return "unparsable code";
  }

  return found;
};
