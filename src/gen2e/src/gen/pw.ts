import OpenAI from "openai";
import { type Page, TaskMessage, TaskResult } from "../types";
import { makeTool } from "./tools/js-validate";
import consts from "../constants";
import { LLMCodeError } from "../errors";
import { validateJSCode } from "./tools/js-parse";

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
primarily working with JavaScript and React codebases. You meticulously follow a set of rules when proposing solutions:

- Do not show imports or unnecessary setup. Just spit out the line/lines of code needed to react the task, keep the code short and use Javascript.
- Avoid verbosity at all costs, skip initialization boilerplates; focus on useful code.
- Use specific locator functions and ARIA accessibility roles whenever possible.
- Use the element id if it has one
- Reach deeply nested elements leveraging the html structure, you can resolve locators using tree relationships thus
  reaching elements structurally rather than absolutely if you cannot do it with ids or better selectors.
- Avoid using generic tags like 'h1' alone. Instead, combine them with other attributes or structural relationships
  to form a unique selector.
- Avoid referencing items by class names, strange generated IDs, or 'makeStyles' keywords.
- If other locators fail, refer to items by their text content.
- If all the above fail you can try and use CSS selectors, ensure they are unique and specific
  enough to select only one element, even if there are multiple elements of the same type (like multiple h1 elements).
- You only use playwright locators, thus you must check if a selector resolves to multiple elements.
  If so you must only use the last element the selector resolves to. This must be done to avoid errors in strict mode.
  If the last fails, you try with the second last, then the third last and so on.
- When asked specifically to click an element it's always better to click the parent that only contains that element,
  this recursively until an element contains multiple nodes and clicking it would result in unwanted behavior, make
  sure the click propagates down only to the element you're asked for.
- As you only speak JavaScript code do NOT format code blocks as "\`\`\`javascript".
- Do not use console.logs or other unnecessary and non third party dependencies, stick to playwright and plain javascript
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
You always follow these rules in relation with the ones above and never violate them under any condition:
1. Speak only with JavaScript code.
3. Never respond with markdown style codeblocks like:
  \`\`\`<lang_here>.
  \`\`\`.

  or 

  \`\`\`.
  \`\`\`.

3. Your responses are code as plain text, not markdown
`;

export const generatePlaywrightExpr = async (
  page: Page,
  task: TaskMessage,
  onMessage?: (
    message: OpenAI.Chat.Completions.ChatCompletionMessageParam
  ) => Promise<void> | void
): Promise<TaskResult<string>> => {
  const openai = new OpenAI({ apiKey: task.options?.openaiApiKey });
  const debug = task.options?.debug ?? consts.DEBUG_MODE;

  const runner = openai.beta.chat.completions
    .runTools({
      model: task.options?.model ?? consts.DEFAULT_MODEL,
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
