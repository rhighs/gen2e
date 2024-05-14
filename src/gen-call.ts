import OpenAI from "openai";
import { type Page, TaskMessage, TaskResult } from "./types";

const defaultDebug = process.env.GEN2E_PLAYWRIGHT_DEBUG === "true";

const prompt = (message: TaskMessage) => {
  return `This is your task: ${message.task}

Webpage snapshot:
\`\`\`
${message.snapshot.dom}
\`\`\`
`;
};

const systemMessage = `
You are a professional testing engineer, an expert in end-to-end testing using Playwright for HTML web applications. You are extremely capable of finding patterns between HTML code and the images a user provides, assuming they resemble the rendered page. You are a Playwright expert and professional end-to-end test code writer, primarily working with TypeScript and React codebases. You meticulously follow a set of rules when proposing solutions:

1. Do not show imports or unnecessary setup. Just spit out the line/lines of code needed to react the task
2. Skip initialization boilerplates; focus on useful code.
3. Keep the code short and use TypeScript.
4. Use specific locator functions and ARIA accessibility roles whenever possible.
5. Use \`page.getByTestId\` for elements with \`data-testid\`.
6. Reach deeply nested elements contextually, referring to meaningful parents or containers.
7. Avoid referencing items by class names, strange generated IDs, or 'makeStyles' keywords.
8. If other locators fail, refer to items by their rendered text.
9. Include documentation in page object models to explain function behavior.
10. Speak only with TypeScript code. No need to format code blocks as "\`\`\`typescript".
11. Avoid verbosity; communicate efficiently with engineers.
12. Use config languages or plain English only when explicitly asked for config settings or detailed explanations, properly formatted for a markdown document.
13. When creating CSS selectors, ensure they are unique and specific enough to select only one element, even if there are multiple elements of the same type (like multiple h1 elements).
14. Avoid using generic tags like 'h1' alone. Instead, combine them with other attributes or structural relationships to form a unique selector.
15. You must not derive data from the page if you are able to do so by using one of the provided functions, e.g. locator_evaluate.
16. Do not use console.logs or other unnecessary stuff
17. If the task you receive include some sort of query sentinment, then the user is expecting a result. In this case you generate a an expression like the following:
  \`\`\`
  (async () => {
    <code_necessary_to_fetch_the_value>
    return value
  })
  \`\`\`

  NOTE: You must not add () at the end of this expression, e.g. calling it

18. Similarly to 17. If you're asked to perform some sort of complex action involving multiple steps BUT not requiring a value you do the following
  \`\`\`
  (async () => {
    <code_necessary_to_achieve_your_goal_and_necessary_await_statements>
  })
  \`\`\`

  NOTE: You must not add () at the end of this expression, e.g. calling it

19. The code you generate must always be given to the tool and never as response to the user
19. Every expression of code you generate must be wrapped in (async () => { <code> })

Use these guidelines to generate precise and efficient Playwright test expressions.


`;

import { RunnableFunctionWithParse } from "openai/lib/RunnableFunction";
import { z } from "zod";

const createActions = (
  page: Page
): Record<string, RunnableFunctionWithParse<any>> => {
  return {
    pipe_generated_code_line: {
      function: async (args: { code: string }) => {
        return args.code;
      },
      description:
        "This is a function you use to pass it generated code, you use this funciton as your main tool. Generated code traverses this tool make use of it the most",
      name: "pipe_generated_code_line",
      parameters: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description:
              "Code you have generated for playwright task you have been asked to accomplish",
          },
        },
      },
      parse: (args: string) => {
        return z
          .object({
            code: z.string(),
          })
          .parse(JSON.parse(args));
      },
    },
  };
};

export const generateCode = async (
  page: Page,
  task: TaskMessage,
  onMessage?: (
    message: OpenAI.Chat.Completions.ChatCompletionMessageParam
  ) => Promise<void> | void
): Promise<TaskResult> => {
  const openai = new OpenAI({ apiKey: task.options?.openaiApiKey });
  const actions = createActions(page);
  const debug = task.options?.debug ?? defaultDebug;

  let genCode = ``;

  const runner = openai.beta.chat.completions
    .runTools({
      model: task.options?.model ?? "gpt-4o-2024-05-13",
      temperature: 0,
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: prompt(task) },
      ],
      tools: Object.values(actions).map((action) => ({
        type: "function",
        function: action,
      })),
    })
    .on("message", (message) => {
      if (debug) {
        console.log("> message", message);
      }

      if (onMessage) {
        onMessage(message);
      }

      if (message.role === "tool" && message.content) {
        if (debug) {
          console.debug("> code gen step ", message.content);
        }

        const jsCode = message.content;
        try {
          // Must be a valid javascript expression, if for some reason the LLM did not generate a valid javascript
          // expression as instructed via system message catch the error and return it as a message to the caller
          eval(jsCode);
        } catch (evalErr) {
          throw new Error(
            `LLM failed generating a valid js expression got eval error = ${evalErr}`
          );
        }

        genCode += jsCode;
      }
    });

  try {
    await runner.finalContent();
  } catch (maybeEvalError) {
    return {
      type: "error",
      errorMessage: maybeEvalError.toString(),
    };
  }

  return {
    type: "success",
    code: genCode,
  };
};
