import {
  createCodeGenAgent,
  defineTool,
  type Gen2EAgentTool,
  type Gen2ELLMAgentModel,
  type Gen2ELLMCodeGenAgent,
} from "@rhighs/gen2e-llm";
import { type Gen2ELogger, makeLogger } from "@rhighs/gen2e-logger";
import { z } from "zod";
import env from "./env";
import type { Gen2EPageObjectFileContents, Gen2EPOCodeAPI, Gen2EPOCodeGenOptions } from "./types";

const SYSTEM_MESSAGE = `\
==== DESCRIPTION ====
You are an extremely capable end-to-end tester. You are a master at using page objects and crearing them.
Your main skill is to correlate HTML, images and playwright instructions with each other to best understand user intentions.
In fact, you correlate them to spot the best page object a new API method needs to go into. If there is no page object present in
your set that best satisfies your needs, you must create one using the tools provided to you. If you have a page object suitable
enough for the task, you must pass it to the page_object_selection tool, which will give you further info on the page object implementation
you'll have to inspect to complete your task.

You will be provided with the following info:
    - What the Playwright instruction aims to do.
    - How the Playwright instruction does it.
    - HTML context.
    - Image representing the rendered HTML.
    - A page URL.

The above will be formatted in JSON, so expect something like:
{
  dirStructure: [<string_path>, ...], // Contains the current dir structure, useful to understand how to compose import statement paths
  from: {
      "expression": <the_playwright_string_code_expression>,
      "pageUrl": <full_page_url>,
      "task": <what_task_the_expression_does>,
  },
  to: {
      "pageUrl": <full_page_url>,
  }
}

==== CORE RULES ====
- You never include multiple page object classes into the same source code; you keep them separate.
- Make sure the root dir is the hostname of every page object.
  e.g. if page object has url https://www.google.com/search, the root path should be www.google.com/<dir_structure_here>/<page_object_name_with_no_exts>
- You only write JSON code.
- You must use your tools to reach the end goal.
- Suppress all introductory headers, explanatory text, and comments within the code. Focus solely on providing the code.
- You always start by call the list_page_objects tool.
- If an instructions mentions filling something into inputs/textbox make sure the values are not hardcoded, instead they shuld be a method dependency e.g. parametrized.
- If you happen to create a page object, it must follow this structure:
  \`\`\`
  export class <page_object_meaningful_class_name> {
    page: Page;
    gen2e_const_pageUrl: string = <page_url_literal_string>;
    gen2e_const_description: string = <description_literal_string>;

    constructor(page: Page) { this.page = page; }

    goto() {
      this.page.goto(this.gen2e_const_pageUrl);
    }
  }
  \`\`\`

  <page_url_literal_string> this value specifically is the prefix before any guid/userid, this is to avoid user specific web page urls.

- When creating a method for a page object, it must have one of 2 possible return types:
  1. string, number or any if the task is asking for something in return.
  2. Another page object instance if page screenshots differ significantly or the pageUrl are different between from and to.
      - If the result page image is very different from the starting page, the method you create must return a page object instance for the result page.
      - If there is no result page Page Object available, create it but into another file using tools.
      async login(username: string, password: string): Promise<AfterLoginPage> {
        <method_code>
        return new AfterLoginPage(this.page);
      }
  
- Never miss import statements, make sure each type, function, variable is in scope and imported.
- If the method is async consider wrapping the return type in a Promise e.g. \`Promise<return_type>\`
- Every filename you generate must end with .gen2e-po.ts as extension.
- You can even create directories by extending the filepaths as you like to make more sense of the page objects structure.
- If there is no directory provided to you, make sure the root starts with the host name and then go on hierarchically.
- Filepath and dirpaths must never start with "/" nor "./".
- When inspecting a page image, be careful on the elements you see: if a modal is present, create a modal page object.
- You always add jsdoc documentation, make sure every method explains what it does in the context it operates.
- If you ever need to change a playwright selector, you must only do so by means of parametrizion: you cannot change the selector core behavior but only the data it uses.
`;

function makeTools(api: Gen2EPOCodeAPI, logger?: Gen2ELogger): Gen2EAgentTool[] {
  let pageObjects: Gen2EPageObjectFileContents[] = [];
  const log = logger ?? makeLogger("GEN2EPO-AGENT-TOOLS");

  const summary = () =>
    JSON.stringify(
      pageObjects.map(({ filename, objects }) => ({ filename, objects })),
      null,
      2,
    );

  const rmTool = defineTool({
    name: "remove_page_object",
    description: `This is a function used to delete page objects files, you only want to use this when performing file renames or page objects. \
This function returns the list of page objects without the one you have deleted. You can delete multiple page objects at time.`,
    inputSchema: z.object({
      pageObjects: z
        .array(z.object({ filepath: z.string().describe("filepath of the page object to delete") }))
        .describe("page objects to delete by filepath"),
    }),
    execute: async ({ pageObjects: targets }) => {
      log.debug("deleting page objects", targets);
      await Promise.all(targets.map(({ filepath }) => api.rm(filepath)));
      pageObjects = await api.list();
      return { output: summary() };
    },
  });

  const peekTool = defineTool({
    name: "page_object_selection",
    description: `This is a function you will pass the choosen page object name to, the result of this function is the source
code of the page object you have choosen. You only call this function once. Use this code to understand what method must be added,
once understood use the create_page_objects to edit the relevant page object.`,
    inputSchema: z.object({ name: z.string().describe("Name of the object you are choosing") }),
    execute: ({ name }) => {
      const pageObject = pageObjects.find((p) => p.objects.some((o) => o.className === name));
      return pageObject
        ? { output: pageObject.source }
        : { output: "ERROR: no such page object found, you must create it.", isError: true };
    },
  });

  const listTool = defineTool({
    name: "list_page_objects",
    description: `This is a function that provides a list of the current page objects present.
Each page object is represented as a JSON object containing the class name, URL, and a description.`,
    inputSchema: z.object({}),
    execute: async () => {
      pageObjects = await api.list();
      const result = summary();
      log.info("listing page objects", result);
      return { output: result };
    },
  });

  const touchTool = defineTool({
    name: "create_page_objects",
    description: `This is a function that receives the source code for a new page object you want to create along with the most appopriate filepath.
The source should already contain the needed methods to achieve the final task. The source code must only contain 1 exported page object class.
If multiple exports are detected this function returns false and you must create different files, true otherwise. If needed, link classes by import statement,
make sure to use the import path correctly to create the other class file, import paths always end with .gen2e-po. You can use this function to create multiple page objects file at a time.`,
    inputSchema: z.object({
      pageObjects: z.array(
        z.object({
          filepath: z.string().describe("filepath for the new page object"),
          source: z.string().describe("source code for the new page object"),
        }),
      ),
    }),
    execute: async ({ pageObjects: files }) => {
      log.debug("creating page objects:", files);
      for (const { filepath, source } of files) {
        const nexports = source.split("\n").filter((line) => line.includes("export ")).length;
        if (nexports > 1) {
          return { output: "false", isError: true };
        }
        await api.touch(filepath, source);
      }
      return { output: "true" };
    },
  });

  return [rmTool, listTool, touchTool, peekTool];
}

/**
 * Manual version of the page object system message. Bump whenever the system
 * message changes so cached page objects are invalidated.
 */
export const GEN2E_PO_PROMPT_VERSION = "2026-10-02.1";

export const createPOCodeGenAgent = (
  defaultModel: Gen2ELLMAgentModel = env.OPENAI_MODEL as Gen2ELLMAgentModel,
  codeAPI: Gen2EPOCodeAPI,
  options?: Gen2EPOCodeGenOptions,
  logger?: Gen2ELogger,
): Gen2ELLMCodeGenAgent =>
  createCodeGenAgent(
    SYSTEM_MESSAGE,
    defaultModel,
    {
      ...options,
      promptVersion: options?.promptVersion ?? GEN2E_PO_PROMPT_VERSION,
    },
    logger,
    makeTools(codeAPI),
    "json",
  );
