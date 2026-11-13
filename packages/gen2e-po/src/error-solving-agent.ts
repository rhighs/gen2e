import {
  createCodeGenAgent,
  defineTool,
  type Gen2EAgentTool,
  type Gen2ELLMAgentBuilderOptions,
  type Gen2ELLMAgentModel,
  type Gen2ELLMCodeGenAgent,
} from "@rhighs/gen2e-llm";
import type { Gen2ELogger } from "@rhighs/gen2e-logger";
import { z } from "zod";
import env from "./env";
import { getDiagnostics, type TypescriptDiagnostic } from "./ts-compile";

export type Gen2EErrorSolvingCodeAPI = {
  list: () => Promise<string[]>;
  peek: (filepath: string) => Promise<string>;
  touch: (filepath: string, source: string) => Promise<void>;
};

const SYSTEM_MESSAGE = `\
==== DESCRIPTION ====
You are an extremely capable TypeScript expert and best in class in solving TypeScript errors.
You excel at analyzing and fixing complex TypeScript code issues, including import errors, type mismatches, and compilation problems.
Your main skill is to correlate TypeScript errors with the project filestructure and available modules to find the most efficient solutions.
You have a specialized tool to check the project filestructure, which you use to resolve import errors and ensure all dependencies are correctly referenced.

You will be provided with the following info:
    - The TypeScript error message.
    - The TypeScript file content where the error occurs.
    - The project filestructure.

The above will be formatted in JSON, so expect something like:
{
  "filepath": <string>,
  "source": <source_code_contained>,
  "errors": [<errors_in_the_source>],
  "projectStructure": [<string_path>, ...] // Contains the current project dir structure, useful to understand how to fix import statement paths
}

==== CORE RULES ====
- You must use your tools to reach the end goal.
- Suppress all introductory headers, explanatory text, and comments within the code. Focus solely on providing the solution.
- You always start by calling the check_filestructure tool to understand the project layout.
- Make sure to use correct and relative import paths based on the provided project filestructure.
- If a module or type is missing, suggest or create a new one following the project conventions.
- Ensure all TypeScript types are correctly defined and used.
- If you need to create or modify a module, follow the existing project structure and naming conventions.
- Use JSDoc to document any new methods or classes you create or modify.
- Focus on efficiency and accuracy in resolving errors to minimize impact on the existing codebase.
- If the diagnostics show import errors due to not found paths, make sure to call the list tool to better understand what path the import statement should refer to instead.
- You cannot stop until get_diagnostics_objects returns no errors.

You can even create new directories or files as needed to ensure the project structure is coherent and imports are correctly resolved.

Your first task is always a JSON object containing:
{
  "filepath": <string>,
  "source": <source_code_contained>,
  "errors": [<errors_in_the_source>],
  "projectStructure": [<string_path>, ...]
}`;

function makeTools(codeAPI: Gen2EErrorSolvingCodeAPI, logger?: Gen2ELogger): Gen2EAgentTool[] {
  const diagnosticsTool = defineTool({
    name: "get_diagnostics_objects",
    description:
      "This function provides a list of TypeScript diagnostics for the current project files. Each diagnostic is represented as a JSON object containing details such as the file name, error message, and location. For each diagnostic object, filename is the name of the file subject to the error being addressed in the adjacent fields.",
    inputSchema: z.object({}),
    execute: async () => {
      const files = await codeAPI.list();
      const diagnostics: TypescriptDiagnostic[] = getDiagnostics(files, { checkJs: true });
      logger?.debug("diagnostics >>> ", diagnostics);
      return { output: JSON.stringify({ diagnostics, files }) };
    },
  });

  const sourceTool = defineTool({
    name: "get_source_code",
    description:
      "This function retrieves the source code of a specified file. You only use this to read source code relevant to the diagnostic errors you get.",
    inputSchema: z.object({ filepath: z.string() }),
    execute: async ({ filepath }) => {
      const source = await codeAPI.peek(filepath);
      logger?.debug("source >>> ", source);
      return { output: source };
    },
  });

  const solveTool = defineTool({
    name: "solve_errors",
    description: "This function saves the provided source code to the specified file path.",
    inputSchema: z.object({ filepath: z.string(), source: z.string() }),
    execute: async ({ filepath, source }) => {
      logger?.debug("fixed source >>> ", source);
      await codeAPI.touch(filepath, source);
      return { output: "saved" };
    },
  });

  return [diagnosticsTool, sourceTool, solveTool];
}

export const createErrorSolverAgent = (
  defaultModel: Gen2ELLMAgentModel = env.OPENAI_MODEL as Gen2ELLMAgentModel,
  codeAPI: Gen2EErrorSolvingCodeAPI,
  options?: Gen2ELLMAgentBuilderOptions,
  logger?: Gen2ELogger,
): Gen2ELLMCodeGenAgent =>
  createCodeGenAgent(
    SYSTEM_MESSAGE,
    defaultModel,
    options,
    logger,
    makeTools(codeAPI, logger),
    "json",
  );
