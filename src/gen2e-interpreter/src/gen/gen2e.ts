import OpenAI from "openai";

import { makeTool } from "@rhighs/gen2e/src/gen/tools/code-sanity";
import { makeFormatTool } from "./tools/ensure-format";
import { validateJSCode } from "@rhighs/gen2e/src/gen/tools/js-parse";
import {
  TaskMessage,
  TaskResult,
  LLMCodeError,
  Gen2EExpression,
  Gen2ELLMCallHooks,
  Gen2ELLMUsageStats,
  Gen2ELLMCall,
} from "@rhighs/gen2e";
import env from "../env";
import { debug } from "../log";

const MARKDOWN_BLOCK_TOKEN = "```";
const MARKDOWN_TS_BLOCK_TOKEN = "```ts";
const MARKDOWN_JS_BLOCK_TOKEN = "```js";
const MARKDOWN_TYPESCRIPT_BLOCK_TOKEN = "```typescript";
const MARKDOWN_JAVASCRIPT_BLOCK_TOKEN = "```javascript";

const sanitizeCodeOutput = (llmOutput: string): string => {
  // rob: sometimes the model won't really get it to remove ``` and not style the code as markdown.
  //      In that case we perform a check here and strip away the markdown annotations.

  for (let startToken of [
    MARKDOWN_TYPESCRIPT_BLOCK_TOKEN,
    MARKDOWN_JAVASCRIPT_BLOCK_TOKEN,
    MARKDOWN_TS_BLOCK_TOKEN,
    MARKDOWN_JS_BLOCK_TOKEN,
    MARKDOWN_BLOCK_TOKEN,
  ]) {
    if (llmOutput.startsWith(startToken)) {
      llmOutput = llmOutput.slice(startToken.length, llmOutput.length);
      break;
    }
  }

  if (
    llmOutput.endsWith(MARKDOWN_BLOCK_TOKEN) ||
    llmOutput.endsWith(MARKDOWN_BLOCK_TOKEN + "\n")
  ) {
    llmOutput = llmOutput.slice(
      0,
      llmOutput.length -
        (MARKDOWN_BLOCK_TOKEN.length + (llmOutput.endsWith("\n") ? 1 : 0))
    );
    llmOutput = llmOutput
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join("\n");
  }

  return llmOutput;
};

// rob: here is a lame copy paste for playwright's expect documentation. This should be enough to not
//      let the llm come up with garbage or wrong expect calls.
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

Here are further examples of how to the gen function is used:

test(
  "executes query",
  gen.test(async ({ page, gen }) => {
    const headerText = await gen("get the header text", { page, test });
    expect(headerText).toBe("Hello, Gen2E!");
  })
);

test(
  "executes query, but adding a simple operation on the target data",
  gen.test(async ({ page, gen }) => {
    const headerText = await gen("get the first letter of the header text", {
      page,
      test,
    });
    expect(headerText).toBe("H");
  })
);

test(
  "executes a simple action, filling a search box",
  gen.test(async ({ page, gen }) => {
    await gen(\`Type "foo" in the search box\`, { page, test });
    await page.pause();
    await expect(page.getByTestId("search-input")).toHaveValue("foo");
  })
);

test(
  "executes click, incrementing a counter",
  gen.test(async ({ page, gen }) => {
    await gen("Click the button until the counter value is equal to 2", {
      page,
      test,
    });
    const count = await gen("Get the count number in click count:", {
      page,
      test,
    });
    await expect(parseInt(count)).toBe(2);
  })
);

test(
  "asserts (toBe), query by question and get a boolean result",
  gen.test(async ({ page, gen }) => {
    const searchInputHasHeaderText = await gen(
      \`Is the contents of the header equal to "Hello, Gen2E!"?\`,
      { page, test }
    );
    expect(searchInputHasHeaderText).toBe(true);
  })
);

test(
  "asserts (not.toBe), asserting a wrong header value",
  gen.test(async ({ page, gen }) => {
    const searchInputHasHeaderText = await gen(
      \`Is the contents of the header equal to "Flying Donkeys"?\`,
      { page, test }
    );
    expect(searchInputHasHeaderText).toBe(false);
  })
);

test(
  "executes query, action and assertion",
  gen.test(async ({ page, gen }) => {
    const headerText = await gen("get the header text", { page, test });
    await gen(\`type "\${headerText}" in the search box\`, { page, test });

    const searchInputHasHeaderText = await gen(
      \`is the contents of the search box equal to "\${headerText}"?\`,
      { page, test }
    );

    expect(searchInputHasHeaderText).toBe(true);
  })
);

test(
  "runs without test parameter",
  gen.test(async ({ page, gen }) => {
    const headerText = await gen("get the header text", { page, test });
    expect(headerText).toBe("Hello, Gen2E!");
  })
);


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
e. YOU OUTPUT MUST NEVER START WITH \`\`\`typescript
`;

export type CodeGenTask = TaskMessage & {
  codeContext?: string;
};

export const generateGen2EExpr: Gen2ELLMCall<
  CodeGenTask,
  Gen2EExpression
> = async (
  task: CodeGenTask,
  hooks?: Gen2ELLMCallHooks,
  openai?: OpenAI
): Promise<TaskResult<Gen2EExpression>> => {
  openai = openai ?? new OpenAI({ apiKey: task.options?.openaiApiKey });
  const isDebug = task.options?.debug ?? env.DEFAULT_MODEL_DEBUG;
  const runner = openai.beta.chat.completions
    .runTools({
      model: task.options?.model ?? env.DEFAULT_OPENAI_MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: prompt(task.task, task.codeContext) },
      ],
      tools: [
        {
          type: "function",
          function: makeTool(({ code }) => validateJSCode(code)),
        },
        {
          type: "function",
          function: makeFormatTool(({ code }) => {
            if (
              code.startsWith("```") ||
              code.startsWith("\\`\\`\\`") ||
              code.endsWith("```") ||
              code.endsWith("\\`\\`\\`")
            ) {
              return {
                success: false,
                reason:
                  "Invalid format, do not use markdown. Code should be formatted as plain string.",
              };
            }

            return {
              success: true,
            };
          }),
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
            new LLMCodeError(`failed generating a valid js expression`)
          );
        }
      }
    });

  let expression: string | null;
  try {
    expression = await runner.finalContent();

    const usage = await runner.totalUsage();
    const usageStats: Gen2ELLMUsageStats = {
      completionTokens: usage.completion_tokens,
      promptTokens: usage.prompt_tokens,
      totalTokens: usage.total_tokens,
    };

    if (!expression) {
      return {
        type: "error",
        errorMessage: `LLM did not generate valid content as final content, got null or empty response = ${expression}`,
      };
    }

    if (hooks?.onUsage) {
      await hooks.onUsage(usageStats);
    }
  } catch (err) {
    return {
      type: "error",
      errorMessage: `LLM call error ${err}`,
    };
  }

  const sanitizedExpr = sanitizeCodeOutput(expression);
  if (isDebug) {
    debug("non-sanitized expression = ", expression);
    debug("sanitized expression result = ", sanitizedExpr);
  }
  return {
    type: "success",
    result: {
      task: task.task,
      expression: sanitizedExpr,
    },
  };
};
