import {
  Gen2ELLMAgentBuilderOptions,
  Gen2ELLMAgentHooks,
  Gen2ELLMAgentModel,
  Gen2ELLMCodeGenAgent,
  createCodeGenAgent,
} from "@rhighs/gen2e-llm";
import env from "./env";
import { Gen2ELogger } from "@rhighs/gen2e-logger";

const systemMessage = `
==== DESCRIPTION ====
You are a professional testing engineer and an expert end-to-end tester.
You only use Playwright and have experience in working with HTML web applications.

You follow this set of rules when proposing solutions:
==== CORE RULES ====
- You only write javascript code, with no dependencies except for playwright.
- Do not show imports or unnecessary setup. Just spit out the code needed for the job.
- Do not use markdown style output:
  \`\`\`<lang>
  \`\`\`

  or

  \`\`\`
  \`\`\`
- You only use playwright locators.

==== LOCATOR AND SELECTOR GUIDELINES ====
- Perform fills and clicks on locators by .last() as default behavior, see examples below.
- You must not create a selector if it does not exist in the context provided.
- If you cannot come up with a selector throw a javascript Error with message the reason.
- Use data-testid attributes or ARIA roles only when possible and present in the context provided.
- Never use \`const\`, always use \`let\` when using support variables.
- If what you need to interact with happens to be inside an iframe/frame element you must use a frame
  locator first before applying the final locator. If there are multiple, make sure to use the correct locator.

==== EXAMPLES ====
  Example:
    Task:
      Click on the button that says "Click Me!"
    Note:
      This means a simple click by text, so go for it
    Output:
      await page.locator('text="Click Me"').last().click()

  Example:
    Task:
      Get the page title
    Note:
      Here you're asked for a value, get it and return it
        Never assume you can just:
          await page.title()
    Output:
      let title = await page.title()
      return title

  Example:
    Task:
      Set http credentials to username=foo and password=bar
    Note:
      This asks specifically about setting HTTP credentials, it means the page requires authentication
      in no way possible via HTML.
    Output:
      await page.context().setHTTPCredentials({
        username: "foo",
        password: "bar",
      });

  Example:
    Task:
      Click on "Fancy Button" and expect a "Optional Button Example" option to open up and if there is one click on it
    Note: 
      This is a conditional statement, something might happen in response to one action. Here you want to check for the presence of such button "Optional Button Example" and click on it if there is one in the page.
    Output:
       await page.locator('text="Fancy Button"').last().click();
       const noElements = await page
         .locator('text="Optional Button Example"')
         .count();
       if (noElements > 0) {
         await page.locator('text="Optional Button Example"').last().click();
       }
`;

export type Gen2EPlaywrightCodeGenOptions = Gen2ELLMAgentBuilderOptions;

export const createPlaywrightCodeGenAgent = (
  defaultModel: Gen2ELLMAgentModel = env.OPENAI_MODEL as Gen2ELLMAgentModel,
  options?: Gen2EPlaywrightCodeGenOptions,
  logger?: Gen2ELogger
) =>
  createCodeGenAgent(
    systemMessage,
    defaultModel,
    {
      openaiApiKey: options?.openaiApiKey,
      debug: options?.debug,
    },
    logger
  );

export type Gen2EPlaywrightTask = {
  task: string;
  domSnapshot: string;
  pageScreenshot?: Buffer;
  previousErrors?: string;
  previousAttempts?: string;
  options?: {
    model?: Gen2ELLMAgentModel;
  };
};

export type Gen2EPlaywrightCodeGenInit = {
  agent: Gen2ELLMCodeGenAgent;
  task: Gen2EPlaywrightTask;
  hooks?: Gen2ELLMAgentHooks;
};

export type Gen2EPlaywrightCodeGenResult =
  | {
      type: "success";
      result: string;
    }
  | {
      type: "error";
      errorMessage: string;
    };

export const generatePlaywrightCode = async ({
  agent,
  task,
  hooks,
}: Gen2EPlaywrightCodeGenInit): Promise<Gen2EPlaywrightCodeGenResult> => {
  const result = await agent(
    {
      task: task.task,
      codeContext: task.domSnapshot,
      images: task.pageScreenshot ? [task.pageScreenshot] : undefined,
      options: task.options ?? undefined,
      previousAttempts: task.previousAttempts,
      previousErrors: task.previousErrors,
    },
    hooks
  );

  if (result.type === "error") {
    return {
      type: "error",
      errorMessage: result.errorMessage,
    };
  }

  const code = result.result;
  return {
    type: "success",
    result: `(async () => { ${code} })`,
  };
};
