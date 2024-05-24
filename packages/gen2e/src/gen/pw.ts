import OpenAI from "openai";
import {
  TaskResult,
  Gen2ELLMCall,
  TaskMessage,
  Gen2ELLMCallHooks,
  Gen2ELLMUsageStats,
} from "../types";
import env from "../env";
import { makeTool } from "./tools/code-sanity";
import { LLMCodeError } from "../errors";
import { validateJSCode } from "./sanity/check-js";
import { debug } from "../log";
import { sanitizeCodeOutput } from "./sanity";
import { makeTracedTool } from "./tools";
import { fitsContext, maxCharactersApprox } from "./token-count";
import { TiktokenModel } from "tiktoken";

const prompt = (task: string, domSnapshot: string) => {
  return `This is your task: ${task}

Webpage snapshot:
\`\`\`
${domSnapshot}
\`\`\`
`;
};
//  - Avoid using generic tags like 'h1' alone. Instead, combine them with other attributes or structural relationships to form a unique selector.

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
      const title = await page.title()
      return title
`;

export type PlayrwightGenTaskMessage = TaskMessage & {
  snapshot: {
    dom: string;
  };
};

export const generatePlaywrightExpr: Gen2ELLMCall<
  PlayrwightGenTaskMessage,
  string
> = async (
  task: PlayrwightGenTaskMessage,
  hooks?: Gen2ELLMCallHooks,
  openai?: OpenAI
): Promise<TaskResult<string>> => {
  openai = openai ?? new OpenAI({ apiKey: task.options?.openaiApiKey });
  const isDebug = task.options?.debug ?? env.DEBUG_MODE;
  const useModel = task.options?.model ?? env.OPENAI_MODEL;

  let taskSystemMessage = systemMessage;
  let taskPrompt = prompt(task.task, task.snapshot.dom);

  const tools = [
    makeTracedTool(
      makeTool(({ code }) => {
        return validateJSCode(code);
      })
    ),
  ];

  // FIXME: temporary cutoff, avoid exceptions and wasted api calls
  //        due to context window smashing.
  {
    let context = taskSystemMessage + taskPrompt;
    if (!fitsContext(useModel as TiktokenModel, context)) {
      const cutAt = maxCharactersApprox(useModel as TiktokenModel);
      context = context.slice(0, cutAt);
      taskPrompt = context.slice(taskSystemMessage.length);
      if (isDebug) {
        debug(`context for task ${taskPrompt.slice(0, 32)}... got cut`);
      }
    }
  }

  const runner = openai.beta.chat.completions
    .runTools({
      model: useModel,
      temperature: 0,
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: taskPrompt },
      ],
      tools: tools.map((tool) => ({
        type: "function",
        function: tool,
      })),
    })
    .on("message", (message) => {
      if (hooks?.onMessage) {
        hooks.onMessage(message);
      }

      if (message.role === "tool" && message.content) {
        if (isDebug) {
          debug(
            "|> code validation step result =",
            message.content,
            new LLMCodeError(
              `failed generating a valid, parsable js expression`
            )
          );
        }
      }
    });

  try {
    const llmSource = await runner.finalContent();
    if (!llmSource) {
      throw new LLMCodeError(`empty or null final content, got ${llmSource}`);
    }

    const code = sanitizeCodeOutput(llmSource);
    const usage = await runner.totalUsage();
    const usageStats: Gen2ELLMUsageStats = {
      model: useModel,
      task: {
        prompt: taskPrompt,
        output: llmSource,
        noToolCalls: tools
          .map((tool) => tool.callCount())
          .reduce((acc, v) => acc + v, 0),
      },
      completionTokens: usage.completion_tokens,
      promptTokens: usage.prompt_tokens,
      totalTokens: usage.total_tokens,
    };

    if (hooks?.onUsage) {
      await hooks.onUsage(usageStats);
    }

    if (isDebug) {
      debug("task completed with usage stats", usageStats);
    }

    return {
      type: "success",
      result: `(async () => { ${code} })`,
    };
  } catch (maybeEvalError) {
    console.error(maybeEvalError.stack);
    return {
      type: "error",
      errorMessage: maybeEvalError.toString(),
    };
  }
};
