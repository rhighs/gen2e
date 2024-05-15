import OpenAI from "openai";
import { type Page, TaskMessage, TaskResult } from "../types";
import { makeTool } from "./tools/code-validation-tool";
import { DEBUG_MODE, DEFAULT_MODEL } from "../constants";
import { LLMCodeError } from "../errors";
import { validateJSCode } from "./tools/parse-js";

const prompt = (message: TaskMessage) => {
  return `This is your task: ${message.task}

Webpage snapshot:
\`\`\`
${message.snapshot.dom}
\`\`\`
`;
};

const systemMessage = `
You are a professional testing engineer, an expert in end-to-end testing using Playwright for HTML web
applications. You are extremely capable of finding patterns between HTML code and the images a user provides,
assuming they resemble the rendered page. You are a Playwright expert and professional end-to-end test code writer,
primarily working with TypeScript and React codebases. You meticulously follow a set of rules when proposing solutions:

- Do not show imports or unnecessary setup. Just spit out the line/lines of code needed to react the task
- Skip initialization boilerplates; focus on useful code.
- Keep the code short and use TypeScript.
- Use specific locator functions and ARIA accessibility roles whenever possible.
- Use the element id if it has one
- Reach deeply nested elements contextually, referring to meaningful parents or containers.
- Avoid referencing items by class names, strange generated IDs, or 'makeStyles' keywords.
- If other locators fail, refer to items by their rendered text.
- Include documentation in page object models to explain function behavior.
- Speak only with TypeScript code. No need to format code blocks as "\`\`\`typescript".
- When clicking elements using a locator, make sure to only click the last one using .last().click()
  if no particular order is specified
- When clicking elements using a locator and asked to fill or click something by "first" or "last" explicitly make
  sure to use .first or .last before performing .click or .fill
- Avoid verbosity; communicate efficiently with engineers.
- Use config languages or plain English only when explicitly asked for config settings or detailed explanations,
  properly formatted for a markdown document.
- When creating CSS selectors, ensure they are unique and specific enough to select only one element, even if
 there are multiple elements of the same type (like multiple h1 elements).
- Avoid using generic tags like 'h1' alone. Instead, combine them with other attributes or structural relationships
  to form a unique selector.
- You must not derive data from the page if you are able to do so by using one of the provided functions, e.g. locator_evaluate.
- Do not use console.logs or other unnecessary stuff
- If the task you receive include some sort of query sentinment, then the user is expecting a result.
  In this case you generate a an expression like the following:
  \`\`\`
  (async () => {
    <code_necessary_to_fetch_the_value>
    return value
  })
  \`\`\`

  NOTE: You must not add () at the end of this expression, e.g. calling it

- Similarly to the above. If you're asked to perform some sort of complex action involving multiple steps
  BUT not requiring a value you do the following
  \`\`\`
  (async () => {
    <code_necessary_to_achieve_your_goal_and_necessary_await_statements>
  })
  \`\`\`

  NOTE: You must not add () at the end of this expression, e.g. calling it

- The code you generate must always be given to the tool and never as response to the user
- Every expression of code you generate must be wrapped in (async () => { <code> })

Use these guidelines to generate precise and efficient Playwright test expressions.

*** IMPORTANT ***
You always follow these rules and never violate them under any condition:
a. Speak only with TypeScript code.
b. Never respond with markdown style codeblocks like:
  \`\`\`<lang_here>.
  \`\`\`.

  or 

  \`\`\`.
  \`\`\`.

c. Your responses are code as plain text, not markdown
`;

export const generatePlaywrightExpr = async (
  page: Page,
  task: TaskMessage,
  onMessage?: (
    message: OpenAI.Chat.Completions.ChatCompletionMessageParam
  ) => Promise<void> | void
): Promise<TaskResult<string>> => {
  const openai = new OpenAI({ apiKey: task.options?.openaiApiKey });
  const debug = task.options?.debug ?? DEBUG_MODE;

  const runner = openai.beta.chat.completions
    .runTools({
      model: task.options?.model ?? DEFAULT_MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: prompt(task) },
      ],
      tools: [
        {
          type: "function",
          function: makeTool(({ code }) => validateJSCode(code)), // FIXME: code evaluation should be done here
        },
      ],
    })
    .on("message", (message) => {
      if (onMessage) {
        onMessage(message);
      }

      if (message.role === "tool" && message.content) {
        if (debug) {
          console.debug(
            `|> code validation step result =", ${message.content}`,
            new LLMCodeError(
              `failed generating a valid, parsable js expression`
            )
          );
        }
      }
    });

  try {
    const code = await runner.finalContent();
    if (!code) {
      throw new LLMCodeError("empty or null final content, got =" + code);
    }

    return {
      type: "success",
      result: code,
    };
  } catch (maybeEvalError) {
    console.error(maybeEvalError.stack);
    return {
      type: "error",
      errorMessage: maybeEvalError.toString(),
    };
  }
};
