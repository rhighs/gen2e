import { TaskResult } from "../types";
import OpenAI from "openai";

import { makeTool } from "./tools/code-validation-tool";
import { validateJSCode } from "./tools/parse-js";
import { LLMCodeError } from "../errors";

const ASSERTIONS_CHEATSHEET: string = `
Description
await expect(locator).toBeAttached()	Element is attached
await expect(locator).toBeChecked()	Checkbox is checked
await expect(locator).toBeDisabled()	Element is disabled
await expect(locator).toBeEditable()	Element is editable
await expect(locator).toBeEmpty()	Container is empty
await expect(locator).toBeEnabled()	Element is enabled
await expect(locator).toBeFocused()	Element is focused
await expect(locator).toBeHidden()	Element is not visible
await expect(locator).toBeInViewport()	Element intersects viewport
await expect(locator).toBeVisible()	Element is visible
await expect(locator).toContainText()	Element contains text
await expect(locator).toHaveAccessibleDescription()	Element has a matching accessible description
await expect(locator).toHaveAccessibleName()	Element has a matching accessible name
await expect(locator).toHaveAttribute()	Element has a DOM attribute
await expect(locator).toHaveClass()	Element has a class property
await expect(locator).toHaveCount()	List has exact number of children
await expect(locator).toHaveCSS()	Element has CSS property
await expect(locator).toHaveId()	Element has an ID
await expect(locator).toHaveJSProperty()	Element has a JavaScript property
await expect(locator).toHaveRole()	Element has a specific ARIA role
await expect(locator).toHaveScreenshot()	Element has a screenshot
await expect(locator).toHaveText()	Element matches text
await expect(locator).toHaveValue()	Input has a value
await expect(locator).toHaveValues()	Select has options selected
await expect(page).toHaveScreenshot()	Page has a screenshot
await expect(page).toHaveTitle()	Page has a title
await expect(page).toHaveURL()	Page has a URL
await expect(response).toBeOK()	Response has an OK status
Non-retrying assertions

These assertions allow to test any conditions, but do not auto-retry. Most of the time, web pages
show information asynchronously, and using non-retrying assertions can lead to a flaky test.

Prefer auto-retrying assertions whenever possible. For more complex assertions that need to be
retried, use expect.poll or expect.toPass.
Assertion	Description
expect(value).toBe()	Value is the same
expect(value).toBeCloseTo()	Number is approximately equal
expect(value).toBeDefined()	Value is not undefined
expect(value).toBeFalsy()	Value is falsy, e.g. false, 0, null, etc.
expect(value).toBeGreaterThan()	Number is more than
expect(value).toBeGreaterThanOrEqual()	Number is more than or equal
expect(value).toBeInstanceOf()	Object is an instance of a class
expect(value).toBeLessThan()	Number is less than
expect(value).toBeLessThanOrEqual()	Number is less than or equal
expect(value).toBeNaN()	Value is NaN
expect(value).toBeNull()	Value is null
expect(value).toBeTruthy()	Value is truthy, i.e. not false, 0, null, etc.
expect(value).toBeUndefined()	Value is undefined
expect(value).toContain()	String contains a substring
expect(value).toContain()	Array or set contains an element
expect(value).toContainEqual()	Array or set contains a similar element
expect(value).toEqual()	Value is similar - deep equality and pattern matching
expect(value).toHaveLength()	Array or string has length
expect(value).toHaveProperty()	Object has a property
expect(value).toMatch()	String matches a regular expression
expect(value).toMatchObject()	Object contains specified properties
expect(value).toStrictEqual()	Value is similar, including property types
expect(value).toThrow()	Function throws an error
expect(value).any()	Matches any instance of a class/primitive
expect(value).anything()	Matches anything
expect(value).arrayContaining()	Array contains specific elements
expect(value).closeTo()	Number is approximately equal
expect(value).objectContaining()	Object contains specific properties
expect(value).stringContaining()	String contains a substring
expect(value).stringMatching()	String matches a regular expression

Negative matchers:
In general, we can expect the opposite to be true by adding a .not to the front of the matchers:

expect(value).not.toEqual(0);
await expect(locator).not.toContainText('some text');
`;

const prompt = (message: string, codeContext: string | undefined) => {
  return `\
This is your task: ${message}

${
  codeContext?.length
    ? `\
You response should be coherent in this context,
think of it as a continuation of the code you see below:

\`\`\`
${codeContext}
\`\`\`

NOTE: what you generate must not conflict with the code above
and your response should not include the context provided.
}`
    : ""
}
  `;
};

const systemMessage = `
You are an experienced typescript programmer, you only and only speak code. 
Any request that would lead to an an answer that is not code should not be
responded as such. Instead you write a code expression to throw an error:
    e.g. \`throw new Error('your error here')\` this is done so that it can be evaluated from the
          compiler that'll use your responses.
You never include import statements or extra context to your code,
instead you generate expressions as dry as possible aiming at the goal
requested to achieve.

You are an expert at using the gen2e testing library; a library for creating
playwright tests using AI under the hood.

Here are the basic examples of how this libary works based on the task you receive:
1.
The task is asking you to perform an assertion, you just ask the gen2e AI to get
what necessary for the assertion and then evaluate it using expect from playwright
\`\`\`
const <exhaustive_result_name> = await gen("<what to ask to the AI to get the value to perform the assertion on>", { page, test }); // <- page and test are MANDATORY, always include them
<here do the assertion using expect with bdd style over the value exhaustive_result_name>
\`\`\`

2.:
The task is asking for some conditions on a webpage, you ask it to gen() giving a
boolean result, you must perform an assertion based on what the task asking you to do:
\`\`\`
const <exhaustive_condition_result_name> = await gen("<what to ask to the AI to evaluate the task condition>", { page, test }); // <- page and test are MANDATORY, always include them
<here do the assertion using expect with bdd style over the value exhaustive_condition_result_name>
\`\`\`

3.
The task is asking for some action that does not lead to a particular result,
like clicking a button, filling a textbox and so on... You simply ask gen() to do it
If you're asked to do the same thing multiple times, you must not loop over
it but you can just ask gen to do the specific thing multiple times
\`\`\`
await gen("<what to ask to the AI to perform the action>", { page, test }); // <- page and test are MANDATORY, always include them
\`\`\`

*** NOTE ***
Exaplaining behavior on asked repetition asked with code: 
If the task asks you e.g.: \"Click the button with text "Click Me" ten times\"
You must NOT respond like this:

await gen("click the button with text 'Click Me'", { page, test });
await gen("click the button with text 'Click Me'", { page, test });
await gen("click the button with text 'Click Me'", { page, test });
await gen("click the button with text 'Click Me'", { page, test });
await gen("click the button with text 'Click Me'", { page, test });
await gen("click the button with text 'Click Me'", { page, test });
await gen("click the button with text 'Click Me'", { page, test });
await gen("click the button with text 'Click Me'", { page, test });
await gen("click the button with text 'Click Me'", { page, test });
await gen("click the button with text 'Click Me'", { page, test });

But rather you simply respond with:
await gen("click the button with text 'Click Me' 10 times", { page, test });

For a single task you must perform actions only from cases 1. 2. 3. shown above, you are allowed to combine them if considered to be useful
in order to react the task goal.

*** IMPORTANT ***
Here is documentation and cheatsheets you can refer to accomplish your task:
${ASSERTIONS_CHEATSHEET}


*** IMPORTANT ***
You always follow these rules and never violate them under any condition:
a. Speak only with TypeScript code.
b. Never respond with markdown style codeblocks like:
  \`\`\`<lang_here>.
  \`\`\`.

  or 

  \`\`\`.
  \`\`\`.

c. When using gen() to get a number value as result, always check the return type. If it is a string you must convert it to number.
d. Your responses are code as plain text, not markdown

`;

export type PlainTextTask = {
  task: string;
  codeContext?: string;
  options: {
    debug?: boolean;
    model?: string;
    openaiApiKey?: string;
  };
};

export type Gen2EExpression = {
  task: string;
  expression: string;
};

export const generateGen2EExpr = async (
  task: PlainTextTask,
  onMessage?: (
    message: OpenAI.Chat.Completions.ChatCompletionMessageParam
  ) => Promise<void> | void,
  openai?: OpenAI
): Promise<TaskResult<Gen2EExpression>> => {
  openai = openai ?? new OpenAI({ apiKey: task.options?.openaiApiKey });
  const debug = task.options?.debug ?? false;

  const runner = openai.beta.chat.completions
    .runTools({
      model: task.options?.model ?? "gpt-4o-2024-05-13",
      temperature: 0,
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: prompt(task.task, task.codeContext) },
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

  let expression: string | null;
  try {
    expression = await runner.finalContent();
    if (!expression) {
      return {
        type: "error",
        errorMessage: `LLM did not generate valid content as final content, got null or empty response = ${expression}`,
      };
    }
  } catch (err) {
    return {
      type: "error",
      errorMessage: `LLM call error ${err}`,
    };
  }

  return {
    type: "success",
    result: {
      task: task.task,
      expression,
    },
  };
};