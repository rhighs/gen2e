import { type Gen2ELogger, makeLogger } from "@rhighs/gen2e-logger";
import {
  generateText,
  jsonSchema,
  type LanguageModel,
  stepCountIs,
  type ToolSet,
  tool,
  type UserContent,
} from "ai";
import { modelId } from "../models";
import type {
  Gen2ELLMAgentHooks,
  Gen2ELLMAgentModel,
  Gen2ELLMAgentRunner,
  Gen2ELLMAgentRunnerInit,
  Gen2ELLMAgentRunnerResult,
  Gen2ELLMAgentTool,
} from "../types";

export type Gen2EVercelRunnerOptions = {
  /**
   * Any AI SDK language model: a `provider/model` string, a provider call
   * such as `gateway("openai/gpt-5.4")` or a custom provider model.
   */
  model: LanguageModel;
  debug?: boolean;
  logger?: Gen2ELogger;
  /** Maximum number of model steps when tools are called. Defaults to 10. */
  maxSteps?: number;
  /** Sampling temperature. When omitted the provider default is used. */
  temperature?: number;
  /** Extra HTTP headers forwarded to the provider. */
  headers?: Record<string, string>;
};

type VercelToolDefinition = Gen2ELLMAgentTool<{ [key: string]: any }>;

/**
 * Agent runner backed by the Vercel AI SDK. One runner speaks to any provider
 * the SDK supports: the Vercel AI Gateway, OpenAI, Anthropic, Google, or any
 * OpenAI-compatible endpoint exposed through a custom provider.
 */
export class Gen2EVercelRunner implements Gen2ELLMAgentRunner {
  private model: LanguageModel;
  private debug: boolean;
  private logger: Gen2ELogger;
  private maxSteps: number;
  private temperature?: number;
  private headers?: Record<string, string>;
  private usage: {
    completionTokens: number;
    promptTokens: number;
    totalTokens: number;
  };

  constructor({
    model,
    debug = false,
    logger,
    maxSteps = 10,
    temperature,
    headers,
  }: Gen2EVercelRunnerOptions) {
    this.model = model;
    this.debug = debug;
    this.maxSteps = maxSteps;
    this.temperature = temperature;
    this.headers = headers;
    this.usage = { completionTokens: 0, promptTokens: 0, totalTokens: 0 };
    this.logger = makeLogger("GEN2E-LLM-AGENT-RUNNER");
    if (logger) {
      this.logger.config(logger);
    }
  }

  async run(
    { taskPrompt, systemMessage, images, tools = [] }: Gen2ELLMAgentRunnerInit,
    hooks?: Gen2ELLMAgentHooks,
  ): Promise<Gen2ELLMAgentRunnerResult> {
    const content: UserContent = [{ type: "text", text: taskPrompt }];
    if (images?.length) {
      for (const image of images) {
        content.push({ type: "file", mediaType: "image/jpeg", data: image });
      }
    }

    const toolSet: ToolSet = {};
    for (const toolDef of tools as VercelToolDefinition[]) {
      toolSet[toolDef.name] = tool({
        description: toolDef.description,
        inputSchema: jsonSchema(toolDef.parameters as never),
        execute: async (args: { [key: string]: any }) => {
          const parsed = toolDef.parse ? toolDef.parse(JSON.stringify(args)) : args;
          return await toolDef.function(parsed);
        },
      });
    }

    if (this.debug) {
      this.logger.debug("vercel runner started using context", {
        taskPrompt,
        systemMessage,
        model: modelId(this.model as Gen2ELLMAgentModel),
      });
    }

    try {
      const result = await generateText({
        model: this.model,
        system: systemMessage,
        messages: [{ role: "user", content }],
        tools: toolSet,
        stopWhen: stepCountIs(this.maxSteps),
        onStepFinish: (step) => {
          if (hooks?.onMessage) {
            hooks.onMessage({ role: "assistant", content: step.text });
          }
        },
        ...(this.temperature !== undefined ? { temperature: this.temperature } : {}),
        ...(this.headers ? { headers: this.headers } : {}),
      });

      this.updateUsage(result.totalUsage);

      if (!result.text) {
        return { type: "error", reason: "got empty final result" };
      }

      if (this.debug) {
        this.logger.debug("vercel runner ended with result", {
          result: result.text,
        });
      }
      return { type: "success", result: result.text };
    } catch (err) {
      if (this.debug) {
        this.logger.error("vercel runner errored", { error: err });
      }
      const reason = err instanceof Error ? err.message : String(err);
      return { type: "error", reason: `got error ${reason}` };
    }
  }

  private updateUsage(usage: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  }) {
    const promptTokens = usage.inputTokens ?? 0;
    const completionTokens = usage.outputTokens ?? 0;
    this.usage = {
      completionTokens,
      promptTokens,
      totalTokens: usage.totalTokens ?? promptTokens + completionTokens,
    };
  }

  async setModel(model: LanguageModel) {
    this.model = model;
  }

  async getUsage() {
    return this.usage;
  }
}
