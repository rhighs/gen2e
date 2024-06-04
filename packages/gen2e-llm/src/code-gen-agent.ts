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
  Gen2ELLMCodeGenAgent,
  Gen2ELLMAgentRunnerInit,
} from "./types";
import { Gen2ELLMGenericError } from "./errors";
import { Gen2EOpenAIRunner } from "./runner/openai";
import { Gen2ELogger, makeLogger } from "@rhighs/gen2e-logger";

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
This is the code context relevant for the code you'll generate:
\`\`\`
${codeContext}
\`\`\`

Make sure the expression you generate does no include variable names that clash with the code above.
Make sure to only return the missing statement or exactly what asked by your task.
Never give back the full context, only the new part.`
    : ""
}`;

const defaultAgentLogger = makeLogger("GEN2E-LLM");

export const createCodeGenAgent: Gen2ELLMAgentBuilder<Gen2ELLMCodeGenAgent> = (
  systemMessage: string,
  model: Gen2ELLMAgentModel,
  options?: Gen2ELLMAgentBuilderOptions,
  logger?: Gen2ELogger
): Gen2ELLMAgent<Gen2ELLMCodeGenAgentTask, string> => {
  const isDebug = options?.debug ?? false;
  const _logger = defaultAgentLogger;
  if (logger) {
    _logger.config(logger);
  }

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
    runner = new Gen2EOpenAIRunner({
      apiKey,
      model,
      debug: isDebug,
      logger: _logger,
    });
  } else {
    throw new Gen2ELLMGenericError(`unsupported model type ${model}`);
  }

  return async (task, hooks): Promise<Gen2ELLMAgentResult<string>> => {
    const taskPrompt = makePrompt(task.task, task.codeContext);

    let expression = "";
    try {
      const runOpts: Gen2ELLMAgentRunnerInit = {
        taskPrompt,
        systemMessage,
        tools,
      };
      if (task.options?.model) {
        runOpts.options = {
          model: task.options?.model,
        };
      }

      if (task.image) {
        if (options?.debug) {
          _logger.debug("using runner with image on model", model);
        }
        runOpts.image = task.image;
      }

      const result = await runner.run(runOpts);
      if (result.type === "error") {
        return {
          type: "error",
          errorMessage: `llm runner failed with reason ${result.reason}`,
        };
      }
      expression = result.result;

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
    if (!validateJSCode(sanitizedExpr)) {
      return {
        type: "error",
        errorMessage: `llm runner failed generation a valid javascript expression, got ${sanitizedExpr}`,
      };
    }

    if (isDebug) {
      _logger.debug("non-sanitized expression ", { expression });
      _logger.debug("sanitized expression result ", {
        expression: sanitizedExpr,
      });
    }

    return {
      type: "success",
      result: sanitizedExpr,
    };
  };
};
