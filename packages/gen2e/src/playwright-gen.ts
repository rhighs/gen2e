import {
  Gen2ELLMAgentBuilderOptions,
  Gen2ELLMAgentHooks,
  Gen2ELLMAgentModel,
  Gen2ELLMCodeGenAgent,
  createCodeGenAgent,
} from "@rhighs/gen2e-llm";
import env from "./env";

const systemMessage = `
==== DESCRIPTION ====
You are a professional testing engineer and an expert end-to-end tester. You only use Playwright and have experience in working with HTML web applications.

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
- Use data-testid attributes or ARIA roles when possible and present in the context provided.
- Look for ids or html attributes that might relate to the task request.
- Perform fills and clicks on locators by .last() as default behavior, see examples below.
- You must not create a selector if it does not exist in the context provided.
- Use selectors by text only if specifically told to so or as a last resort if other selectors cannot be used.
- If you cannot come up with a selector throw a javascript Error with message the reason.
- Never use \`const\`, always use \`let\` when using support variables.

==== EXAMPLES ====
  Example:
    Task:
      Click on the button that says "Click Me!"
    Note:
      This means a simple click by text, so go for it
    Ouput:
      await page.locator('text="Click Me"').last().click()

  Example:
    Task:
      Get the page title
    Note:
      Here you're asked for a value, get it and return it
        Never assume you can just:
          await page.title()
    Ouput:
      let title = await page.title()
      return title
`;

export type Gen2EPlaywrightCodeGenOptions = Gen2ELLMAgentBuilderOptions;

export const createPlaywrightCodeGenAgent = (
  defaultModel: Gen2ELLMAgentModel = env.OPENAI_MODEL as Gen2ELLMAgentModel,
  options?: Gen2EPlaywrightCodeGenOptions
) =>
  createCodeGenAgent(systemMessage, defaultModel, {
    openaiApiKey: options?.openaiApiKey,
    debug: options?.debug,
  });

export type Gen2EPlaywrightCodeGenInit = {
  agent: Gen2ELLMCodeGenAgent;
  task: string;
  domSnapshot: string;
  options?: {
    model?: Gen2ELLMAgentModel;
  };
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
  domSnapshot,
  options,
  hooks,
}: Gen2EPlaywrightCodeGenInit): Promise<Gen2EPlaywrightCodeGenResult> => {
  const result = await agent(
    {
      task: task,
      codeContext: domSnapshot,
      options: options ?? undefined,
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
