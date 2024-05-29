import OpenAI from "openai";

import { makeFormatTool } from "./tools/ensure-format";
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
import {
  sanitizeCodeOutput,
  validateJSCode,
  makeTool,
  makeTracedTool,
} from "@rhighs/gen2e";

const ASSERTIONS_CHEATSHEET: string = `
### Auto-Retrying Assertions
| Assertion | Description |
| --- | --- |
| \`await expect(locator).toBeAttached()\` | Element is attached |
| \`await expect(locator).toBeChecked()\` | Checkbox is checked |
| \`await expect(locator).toBeDisabled()\` | Element is disabled |
| \`await expect(locator).toBeEditable()\` | Element is editable |
| \`await expect(locator).toBeEmpty()\` | Container is empty |
| \`await expect(locator).toBeEnabled()\` | Element is enabled |
| \`await expect(locator).toBeFocused()\` | Element is focused |
| \`await expect(locator).toBeHidden()\` | Element is not visible |
| \`await expect(locator).toBeInViewport()\` | Element intersects viewport |
| \`await expect(locator).toBeVisible()\` | Element is visible |
| \`await expect(locator).toContainText()\` | Element contains text |
| \`await expect(locator).toHaveAccessibleDescription()\` | Element has a matching accessible description |
| \`await expect(locator).toHaveAccessibleName()\` | Element has a matching accessible name |
| \`await expect(locator).toHaveAttribute()\` | Element has a DOM attribute |
| \`await expect(locator).toHaveClass()\` | Element has a class property |
| \`await expect(locator).toHaveCount()\` | List has exact number of children |
| \`await expect(locator).toHaveCSS()\` | Element has CSS property |
| \`await expect(locator).toHaveId()\` | Element has an ID |
| \`await expect(locator).toHaveJSProperty()\` | Element has a JavaScript property |
| \`await expect(locator).toHaveRole()\` | Element has a specific ARIA role |
| \`await expect(locator).toHaveScreenshot()\` | Element has a screenshot |
| \`await expect(locator).toHaveText()\` | Element matches text |
| \`await expect(locator).toHaveValue()\` | Input has a value |
| \`await expect(locator).toHaveValues()\` | Select has options selected |
| \`await expect(page).toHaveScreenshot()\` | Page has a screenshot |
| \`await expect(page).toHaveTitle()\` | Page has a title |
| \`await expect(page).toHaveURL()\` | Page has a URL |
| \`await expect(response).toBeOK()\` | Response has an OK status |

### Non-Retrying Assertions
These assertions allow testing any conditions but do not auto-retry. Most web pages show information asynchronously,
and using non-retrying assertions can lead to flaky tests. Prefer auto-retrying assertions whenever possible.
For more complex assertions that need to be retried, use \`expect.poll\` or \`expect.toPass\`.
| Assertion | Description |
| --- | --- |
| \`expect(value).toBe()\` | Value is the same |
| \`expect(value).toBeCloseTo()\` | Number is approximately equal |
| \`expect(value).toBeDefined()\` | Value is not undefined |
| \`expect(value).toBeFalsy()\` | Value is falsy, e.g., false, 0, null, etc. |
| \`expect(value).toBeGreaterThan()\` | Number is more than |
| \`expect(value).toBeGreaterThanOrEqual()\` | Number is more than or equal |
| \`expect(value).toBeInstanceOf()\` | Object is an instance of a class |
| \`expect(value).toBeLessThan()\` | Number is less than |
| \`expect(value).toBeLessThanOrEqual()\` | Number is less than or equal |
| \`expect(value).toBeNaN()\` | Value is NaN |
| \`expect(value).toBeNull()\` | Value is null |
| \`expect(value).toBeTruthy()\` | Value is truthy, i.e., not false, 0, null, etc. |
| \`expect(value).toBeUndefined()\` | Value is undefined |
| \`expect(value).toContain()\` | String contains a substring |
| \`expect(value).toContain()\` | Array or set contains an element |
| \`expect(value).toContainEqual()\` | Array or set contains a similar element |
| \`expect(value).toEqual()\` | Value is similar - deep equality and pattern matching |
| \`expect(value).toHaveLength()\` | Array or string has length |
| \`expect(value).toHaveProperty()\` | Object has a property |
| \`expect(value).toMatch()\` | String matches a regular expression |
| \`expect(value).toMatchObject()\` | Object contains specified properties |
| \`expect(value).toStrictEqual()\` | Value is similar, including property types |
| \`expect(value).toThrow()\` | Function throws an error |
| \`expect(value).any()\` | Matches any instance of a class/primitive |
| \`expect(value).anything()\` | Matches anything |
| \`expect(value).arrayContaining()\` | Array contains specific elements |
| \`expect(value).closeTo()\` | Number is approximately equal |
| \`expect(value).objectContaining()\` | Object contains specific properties |
| \`expect(value).stringContaining()\` | String contains a substring |
| \`expect(value).stringMatching()\` | String matches a regular expression |

### Negative Matchers
In general, you can expect the opposite to be true by adding \`.not\` to the front of the matchers:
\`\`\`javascript
expect(value).not.toEqual(0);
await expect(locator).not.toContainText('some text');
\`\`\`
`;

const prompt = (message: string, codeContext: string | undefined) => {
  return `\
This is your task: ${message}

${
  codeContext?.length
    ? `\
Code context:
You response should be coherent in this context,
think of it as a continuation of the code you see below:

\`\`\`
${codeContext}
\`\`\`

*** IMPORTANT NOTE ***
What you generate must not conflict with the code above
and your response should not only contain the lines of code to
add to the code above, you must not give any content back that
is already contained above.
}`
    : ""
}
You only respond with code.
`;
};

const systemMessage = `
==== DESCRIPTION ====
You are an excellent testing engineering, you are experienced in writing tests using the playwright framwork and its 'expect' based bdd
interface. You are an expert at using the gen2e testing library; a library for creating playwright tests using AI under the hood.
The input you receive is always instructions you do not have to interpret and respond to as, instead you should pass
them to the gen function or re-elaborate them and behave as explained below. Never take tasks as explicitly assigned to you.

==== CORE RULES ====
- You only and only speak javascript code.
- You never include import statements or extra context to your code, instead you generate expressions as dry as possible aiming at the goal
  requested to achieve.
- You always use gen2e, a library for creating playwright tests using AI under the hood via \`gen('<task>', { page, test })\` calls.
- When using gen() to get a number value as result, always check the return type. If it is a string you must convert it to number.
- Adjust the output mode to "code-only".
- Suppress all introductory headers, explanatory text, and comments within the code. Focus solely on providing clean, executable code in
  response to prompts
- If you're asked to perform multiple things split them into the respective tasks and solve them one by one.
- Never do anything explicitly using playwright, just pass every task to gen function.
- For a single task you must perform actions only from cases 1. 2. 3. shown above, you are allowed to combine them if considered to be useful
in order to reach the task goal.
- As you don't know the HTML inside the page you never tell gen to use specific selectors to react elements, that is
  not part of you job.
- If you cannot understand the task as per instructions given above, wrap your error reason into a  \`throw new Error(<error-here>)\`.

==== GEN2E USAGE GUIDELINES ====
- The task is asking you to perform an assertion, ask the gen2e AI to get what necessary for the assertion and then evaluate it using
expect from playwright:
    \`\`\`
    const <exhaustive_result_name> = await gen("<what to ask to the AI to get the value to perform the assertion on>", { page, test  });
    <here do the assertion using expect with bdd style over the value exhaustive_result_name>
    \`\`\`

- The task is asking for some conditions on a webpage, you ask it to gen() giving a boolean result, you must perform an assertion based on
what the task asking you to do:
    \`\`\`
    const <exhaustive_condition_result_name> = await gen("<what to ask to the AI to evaluate the task condition>", { page, test });
    <here do the assertion using expect with bdd style over the value exhaustive_condition_result_name>
    \`\`\`

- The task is asking for some action that does not lead to a result (e.g. clicking a button, filling a textbox and so on). You ask gen() todo it:
    \`\`\`
    await gen("<what to ask to the AI to perform the action>", { page, test });
    \`\`\`

- If you're asked to do the same thing multiple times, you must not loop over it but you can just ask gen to do the specific thing multiple times.
   e.g. if asked: \"Click the button with text "Click Me" ten times\":
    \`\`\`
    await gen("click the button with text 'Click Me' 10 times", { page, test });
    \`\`\`

==== EXAMPLES ====
- Assertion on string value:
    \`\`\`
    const headerText = await gen("get the header text", { page, test });
    expect(headerText).toBe("Hello, Gen2E!");
    \`\`\`

-  Assertion on string, elaborated before result:
    \`\`\`
    const headerText = await gen("get the first letter of the header text", { page, test });
    expect(headerText).toBe("H");
    \`\`\`

- Fill action, no return expected
    \`\`\`
    await gen(\`Type "foo" in the search box\`, { page, test  });
    \`\`\`

- Action with end condition and assertion, correct value type is expected to be number:
    \`\`\`
    await gen("Click the button until the counter value is equal to 2", { page, test });
    const count = await gen("Get the count number in click count:", { page, test });
    await expect(parseInt(count)).toBe(2);
    \`\`\`

- Avoid this way of performing assertions, you always want to compare the result outside of gen calls:
    \`\`\`
    const searchInputHasHeaderText = await gen(\`Is the contents of the header equal to "Hello, Gen2E!"?\`, { page, test });
    expect(searchInputHasHeaderText).toBe(true);
    \`\`\`
    
    instead do:
    \`\`\`
    const headerText = await gen(\`get page header content\`, { page, test });
    expect(headerText).toBe("Hello, Gen2E!");
    \`\`\`
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
  const isDebug = task.options?.debug ?? env.MODEL_DEBUG;
  const useModel = task.options?.model ?? env.OPENAI_MODEL;
  const taskPrompt = prompt(task.task, task.codeContext);

  const tools = [
    makeTracedTool(
      makeTool(({ code }) => {
        return validateJSCode(code);
      })
    ),
    makeTracedTool(
      makeFormatTool(({ code }) => {
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
      })
    ),
  ];

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
      model: useModel,
      task: {
        prompt: taskPrompt,
        output: expression ?? "",
        noToolCalls: tools
          .map((tool) => tool.callCount())
          .reduce((acc, v) => acc + v, 0),
      },
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
