import {
  Gen2ELLMAgentBuilderOptions,
  Gen2ELLMAgentModel,
  Gen2ELLMAgentTool,
  Gen2ELLMCodeGenAgent,
  createCodeGenAgent,
} from "@rhighs/gen2e-llm";
import env from "./env";
import { Gen2ELogger, makeLogger } from "@rhighs/gen2e-logger";
import z from "zod";
import { Gen2EPOCodeAPI, Gen2EPageObjectFileContents } from "./types";

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
- Every filename you generate for a page object must have the following format <kebab-case-class-name-without-page-suffix>, never include gen2e nor file extensions.
- You can even create directories by extending the filepaths as you like to make more sense of the page objects structure.
- If there is no directory provided to you, make sure the root starts with the host name and then go on hierarchically.
- Filepath and dirpaths must never start with "/" nor "./".
- When inspecting a page image, be careful on the elements you see: if a modal is present, create a modal page object.
- You always add jsdoc documentation, make sure every method explains what it does in the context it operates.
- If you ever need to change a playwright selector, you must only do so by means of parametrizion: you cannot change the selector core behavior but only the data it uses.
`;

export type Gen2EPOCodeGenOptions = Gen2ELLMAgentBuilderOptions;


function makeTools(
  api: Gen2EPOCodeAPI,
  logger?: Gen2ELogger
): Gen2ELLMAgentTool<{
  code?: string;
  [key: string]: any;
}>[] {
  let pageObjects: Gen2EPageObjectFileContents[] = [];
  logger = logger ?? makeLogger("GEN2EPO-AGENT-TOOLS");
  const rm_tool = {
    description: `This is a function used to delete page objects files, you only want to use this when performing file renames or page objects. \
This function returns the list of page objects without the one you have deleted. You can delete multiple page objects at time.`,
    function: async (params: any): Promise<string> => {
      logger.debug("deleting page objects", params.pageObjects);
      await Promise.all(
        params.pageObjects.map(({ filepath }) => api.rm(filepath))
      );
      pageObjects = await api.list();
      const result = pageObjects.map(({ filename, objects, ..._rest }) => ({
        filename,
        objects,
      }));
      return JSON.stringify(result, null, 2);
    },
    name: "remove_page_object",
    parameters: {
      type: "object",
      properties: {
        filepath: {
          type: "string",
          description: "filepath for the new page object",
        },
      },
    },
    parse: (args: string) =>
      z
        .object({
          filepath: z.string(),
        })
        .parse(JSON.parse(args)),
  };

  const peek_tool = {
    description: `This is a function you will pass the choosen page object name to, the result of this function is the source
code of the page object you have choosen. You only call this function once. Use this code to understand what method must be added,
once understood use the create_page_objects to edit the relevant page object.`,
    function: (params: any): string => {
      const { name } = params;
      const pageObject = pageObjects.find(
        (p) => p.objects.find((o) => o.className === name) !== undefined
      );

      return (
        pageObject?.source ??
        "ERROR: no such page object found, you must create it."
      );
    },
    name: "page_object_selection",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name of the object you are choosing",
        },
      },
    },
    parse: (args: string) =>
      z
        .object({
          name: z.string(),
        })
        .parse(JSON.parse(args)),
  };

  const list_tool = {
    description: `This is a function that provides a list of the current page objects present.
Each page object is represented as a JSON object containing the class name, URL, and a description.`,
    function: async (): Promise<string> => {
      pageObjects = await api.list();
      const result = pageObjects.map(({ filename, objects, ..._rest }) => ({
        filename,
        objects,
      }));
      logger.info("listing page objects", result);
      return JSON.stringify(result, null, 2);
    },
    name: "list_page_objects",
    parameters: {
      type: "object",
      properties: {},
    },
    parse: (args: string) => {
      return {};
    },
  };

  const touch_tool = {
    description: `This is a function that receives the source code for a new page object you want to create along with the most appopriate filepath.
The source should already contain the needed methods to achieve the final task. The source code must only contain 1 exported page object class.
If multiple exports are detected this function returns false and you must create different files, true otherwise. If needed, link classes by import statement,
make sure to use the import path correctly to create the other class file, import paths always end with .gen2e-po. You can use this function to create multiple page objects file at a time.`,
    function: async (params: any): Promise<boolean> => {
      const { pageObjects } = params;

      logger.debug("creating page objects:", pageObjects);
      for (let { filepath, source } of pageObjects) {
        const nexports = source
          .split("\n")
          .filter((line: string) => line.includes("export ")).length;
        if (nexports > 1) {
          return false;
        }
        await api.touch(filepath, source);
      }
      return true;
    },
    name: "create_page_objects",
    parameters: {
      type: "object",
      properties: {
        pageObjects: {
          type: "array",
          items: {
            type: "object",
            properties: {
              filepath: {
                type: "string",
                description: "filepath for the new page object",
              },
              source: {
                type: "string",
                description: "source code for the new page object",
              },
            },
            required: ["filepath", "source"],
          },
        },
      },
      required: ["objects"],
    },
    parse: (args: string) =>
      z
        .object({
          pageObjects: z.array(
            z.object({
              filepath: z.string(),
              source: z.string(),
            })
          ),
        })
        .parse(JSON.parse(args)),
  };

  return [rm_tool, list_tool, touch_tool, peek_tool];
}

export const createPOCodeGenAgent = (
  defaultModel: Gen2ELLMAgentModel = env.OPENAI_MODEL as Gen2ELLMAgentModel,
  codeAPI: Gen2EPOCodeAPI,
  options?: Gen2EPOCodeGenOptions,
  logger?: Gen2ELogger
): Gen2ELLMCodeGenAgent => {
  return createCodeGenAgent(
    SYSTEM_MESSAGE,
    defaultModel,
    options,
    logger,
    makeTools(codeAPI),
    "json"
  );
};
