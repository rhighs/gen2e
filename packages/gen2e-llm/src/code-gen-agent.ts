import { sanitizeCodeOutput, validateJSCode } from "./sanity";
import { makeTool, makeTracedTool } from "./tools";
import { makeFormatTool } from "./tools/ensure-format";
import {
  Gen2ELLMAgent,
  Gen2ELLMAgentBuilder,
  Gen2ELLMAgentBuilderOptions,
  Gen2ELLMAgentModel,
  Gen2ELLMAgentResult,
  Gen2ELLMCodeGenAgentTask,
  Gen2ELLMAgentUsageStats,
  Gen2ELLMAgentRunner,
  Gen2ELLMAgentOpenAIModel,
} from "./types";
import { debug } from "./log";
import { Gen2ELLMGenericError } from "./errors";
import { Gen2EOpenAIRunner } from "./runner/openai";

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

const makePrompt = (message: string, codeContext: string | undefined) =>
  `\
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
`
    : ""
}`;

export const createCodeGenAgent: Gen2ELLMAgentBuilder<
  Gen2ELLMCodeGenAgentTask,
  string
> = (
  systemMessage: string,
  model: Gen2ELLMAgentModel,
  options?: Gen2ELLMAgentBuilderOptions
): Gen2ELLMAgent<Gen2ELLMCodeGenAgentTask, string> => {
  const isDebug = options?.debug ?? false;

  let runner: Gen2ELLMAgentRunner;
  if (model.startsWith("gpt")) {
    model = model as Gen2ELLMAgentOpenAIModel;
    let apiKey = options?.openaiApiKey;
    if (!apiKey) {
      apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Gen2ELLMGenericError(
          "openai model supplied but no openai api key was found"
        );
      }
    }
    runner = new Gen2EOpenAIRunner({ apiKey, model, debug: isDebug });
  } else {
    throw new Gen2ELLMGenericError(`unsupported model type ${model}`);
  }

  return async (task, hooks): Promise<Gen2ELLMAgentResult<string>> => {
    const taskPrompt = makePrompt(task.task, task.codeContext);

    let expression = "";
    try {
      const result = await runner.run({ taskPrompt, systemMessage, tools });
      if (result.type === "error") {
        return {
          type: "error",
          errorMessage: `llm runner failed with reason ${result.reason}`,
        };
      }
      expression = result.result;

      if (!validateJSCode(expression)) {
        return {
          type: "error",
          errorMessage: `llm runner failed generation a valid javascript expression, got ${expression}`,
        };
      }

      const usage = await runner.getUsage();
      const usageStats: Gen2ELLMAgentUsageStats = {
        model,
        task: {
          prompt: taskPrompt,
          output: expression ?? "",
          noToolCalls: tools
            .map((tool) => tool.callCount())
            .reduce((acc, v) => acc + v, 0),
        },
        completionTokens: usage.completionTokens,
        promptTokens: usage.promptTokens,
        totalTokens: usage.totalTokens,
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
      result: sanitizedExpr,
    };
  };
};
