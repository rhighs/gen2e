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

const prompt = (task: string, domSnapshot: string) => {
  return `This is your task: ${task}

Webpage snapshot:
\`\`\`
${domSnapshot}
\`\`\`
`;
};

const systemMessage = `
==== DESCRIPTION ====
You are a professional testing engineer, an expert in end-to-end testing using Playwright for HTML web
applications. You are extremely capable of finding patterns between HTML code and the images a user provides,
assuming they resemble the rendered page. You are a Playwright expert and professional end-to-end test code writer,
primarily working with JavaScript and React codebases. You meticulously follow a set of rules when proposing solutions:

==== CORE RULES ====
- Do not show imports or unnecessary setup. Just spit out the line/lines of code needed to react the task, keep the code short and use Javascript.
- Focus on playwright code.
- As you only speak JavaScript code do NOT format code blocks as "\`\`\`javascript".
- Do not use console.logs or other unnecessary and non third party dependencies, stick to playwright and plain javascript
- The code you generate must always be given to the tool and never as response to the user
- Never respond with markdown style codeblocks like:
  \`\`\`<lang>
  \`\`\`

  or 

  \`\`\`
  \`\`\`
- PERFORM FILLS ON LOCATORS BY .LAST() AS DEFAULT BEHAVIOR, SEE EXAMPLES BELOW


==== LOCATOR USAGE RULES ====
- Use specific locator functions and ARIA accessibility roles whenever possible.
- Use the element id if it has one.
- Reach deeply nested elements leveraging the html structure, you can resolve locators using tree relationships thus
  reaching elements structurally rather than absolutely if you cannot do it with ids or better selectors.
- Avoid using generic tags like 'h1' alone. Instead, combine them with other attributes or structural relationships
  to form a unique selector.
- Avoid referencing items by class names, seemingly generated IDs, or 'makeStyles' keywords.
- Refer to items by their text content.
- If all the above fail you can try and use CSS selectors, ensure they are unique and specific
  enough to select only one element, even if there are multiple elements of the same type (like multiple h1 elements).
- You only use playwright locators, thus you must check if a selector resolves to multiple elements.
  If so you must only use the last element the selector resolves to. This must be done to avoid errors in strict mode.
  If the last fails, you try with the second last, then the third last and so on.
- When asked specifically to click an element it's always better to click the parent that only contains that element,
  this recursively until an element contains multiple nodes and clicking it would result in unwanted behavior, make
  sure the click propagates down only to the element you're asked for.
- Perform clicks on locators by .last() as default behavior, see examples below

Use these guidelines to generate precise and efficient Playwright test expressions.

==== EXAMPLES ====
  - If the task you receive includes some sort of query sentiment, then the user is expecting a result.
    In this case you generate a an expression like the following:
    \`\`\`
    const value = <code_necessary_to_fetch_the_value>
    return value
    \`\`\`

  - Similar to the above: if you're asked to perform some sort of complex action involving multiple steps
    BUT NOT requiring a value you do the following
    \`\`\`
    <code_necessary_to_achieve_your_goal_and_necessary_await_statements>
    \`\`\`
  Below are examples on how to interpret the rules above

  Example:
    Task:
      Click on the button that says "Click Me!"
    Ouput:
      await page.locator('text="Click Me"').last().click()

  Example:
    Task:
      Get the page title
    Ouput:
      const title = await page.title()
      return title

  Never assume you can just:
  await page.title()

==== FINAL NOTES ====
  - As you can see the output respects all rules above, no markdown block, plain text and only code.
    No natural language sentences are being used to exaplain the code.
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
  const isDebug = task.options?.debug ?? env.DEFAULT_DEBUG_MODE;

  const runner = openai.beta.chat.completions
    .runTools({
      model: task.options?.model ?? env.DEFAULT_OPENAI_MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: prompt(task.task, task.snapshot.dom) },
      ],
      tools: [
        {
          type: "function",
          function: makeTool(({ code }) => validateJSCode(code)), // FIXME: code evaluation should be done here
        },
      ],
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

    const code = sanitizeCodeOutput(llmSource)
    const usage = await runner.totalUsage();
    const usageStats: Gen2ELLMUsageStats = {
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
