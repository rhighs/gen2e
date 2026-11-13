import { z } from "zod";
import { findForbiddenJS, validateJSCode, validateJSONString } from "./sanity";
import { defineTool, type Gen2EAgentTool } from "./tool";

const codeInput = z.object({
  code: z.string().describe("The code you are about to give as your final answer."),
});

export const isMarkdownWrapped = (code: string): boolean =>
  code.startsWith("```") ||
  code.startsWith("\\`\\`\\`") ||
  code.endsWith("```") ||
  code.endsWith("\\`\\`\\`");

export const formatValidationTool = (): Gen2EAgentTool =>
  defineTool({
    name: "format_validation_tool",
    description:
      "Checks the output format of the code you are about to return. Call it before answering. If it reports an error, fix the format and call it again.",
    inputSchema: codeInput,
    execute: ({ code }) =>
      isMarkdownWrapped(code)
        ? {
            output:
              "Invalid format, do not use markdown. Code should be formatted as plain string.",
            isError: true,
          }
        : { output: "format ok" },
  });

export const codeValidationTool = (lang: "javascript" | "json"): Gen2EAgentTool =>
  defineTool({
    name: "code_validation_tool",
    description: `Parses the ${lang} you are about to return. Call it before answering. If it reports an error, fix the code and call it again.`,
    inputSchema: codeInput,
    execute: ({ code }) => {
      if (lang === "json") {
        return validateJSONString(code)
          ? { output: "code ok" }
          : { output: "invalid json", isError: true };
      }
      if (!validateJSCode(code)) {
        return { output: "invalid javascript", isError: true };
      }
      const forbidden = findForbiddenJS(code);
      return forbidden
        ? { output: `\`${forbidden}\` is not allowed in generated code`, isError: true }
        : { output: "code ok" };
    },
  });

export const createValidationTools = (lang: string): Gen2EAgentTool[] => {
  if (lang === "javascript" || lang === "typescript") {
    return [formatValidationTool(), codeValidationTool("javascript")];
  }
  if (lang === "json") {
    return [formatValidationTool(), codeValidationTool("json")];
  }
  return [formatValidationTool()];
};
