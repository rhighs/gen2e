import OpenAI from "openai";
import {
  Gen2ELLMAgentOpenAIModel,
  Gen2ELLMAgentRunner,
  Gen2ELLMAgentRunnerInit,
  Gen2ELLMAgentRunnerResult,
} from "../types";
import { fitsContext, maxCharactersApprox } from "./openai-token";
import { TiktokenModel } from "tiktoken";
import { Gen2ELogger, makeLogger } from "@rhighs/gen2e-logger";

export type Gen2EOpenAIRunnerOptions = {
  apiKey: string;
  model: Gen2ELLMAgentOpenAIModel;
  debug?: boolean;
  openai?: OpenAI;
  logger?: Gen2ELogger;
};

const modelSupportsImage = (model: Gen2ELLMAgentOpenAIModel): boolean => {
  switch (model) {
    case "gpt-4-turbo":
    case "gpt-4-turbo-2024-04-09":
    case "gpt-4-vision-preview":
    case "gpt-4o":
    case "gpt-4o-2024-05-13":
      return true;
    default:
      return false;
  }
};

export class Gen2EOpenAIRunner implements Gen2ELLMAgentRunner {
  private openai: OpenAI;
  private model: Gen2ELLMAgentOpenAIModel;
  private debug: boolean;
  private logger: Gen2ELogger;
  private usage: {
    completionTokens: number;
    promptTokens: number;
    totalTokens: number;
  };

  constructor({
    apiKey,
    model,
    debug = false,
    openai,
    logger,
  }: Gen2EOpenAIRunnerOptions) {
    this.openai = openai ?? new OpenAI({ apiKey });
    this.model = model;
    this.debug = debug;
    this.usage = { completionTokens: 0, promptTokens: 0, totalTokens: 0 };
    this.logger = makeLogger("GEN2E-LLM-AGENT-RUNNER");
    if (logger) {
      this.logger.config(logger);
    }
  }

  async run({
    taskPrompt,
    systemMessage,
    image,
    tools = [],
  }: Gen2ELLMAgentRunnerInit): Promise<Gen2ELLMAgentRunnerResult> {
    taskPrompt = this.adjustContext(systemMessage + taskPrompt, systemMessage);

    if (this.debug) {
      this.logger.debug("openai runner started using context", {
        taskPrompt,
        systemMessage,
      });
    }

    if (image && !modelSupportsImage(this.model)) {
      return {
        type: "error",
        reason: "model does not supporting feeding images",
      };
    }

    const content: OpenAI.Chat.ChatCompletionContentPart[] = [
      { type: "text", text: taskPrompt },
    ];
    if (image) {
      const imageb64 = image.toString("base64");
      if (this.debug) {
        this.logger.debug(
          `runner sending png image ${imageb64.substring(0, 32)}...`
        );
      }

      content.push({
        type: "image_url",
        image_url: {
          url: `data:image/png;base64,${imageb64}`,
        },
      });
    }

    try {
      const runner = this.openai.beta.chat.completions.runTools({
        model: this.model,
        temperature: 0,
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content },
        ],
        tools: tools.map((tool) => ({
          type: "function",
          function: tool,
        })),
      });

      const finalContent = await runner.finalContent();
      const usage = await runner.totalUsage();
      this.updateUsage({ ...usage });

      if (!finalContent) {
        return { type: "error", reason: "got empty final result" };
      }

      if (this.debug) {
        this.logger.debug("openai runner ended with result", {
          result: finalContent,
        });
      }
      return { type: "success", result: finalContent };
    } catch (err) {
      if (this.debug) {
        this.logger.error("openai runner errored", {
          error: err,
        });
      }
      return { type: "error", reason: `got error ${err.toString()}` };
    }
  }

  private adjustContext(context: string, systemMessage: string): string {
    if (!fitsContext(this.model as TiktokenModel, context)) {
      const cutAt = maxCharactersApprox(this.model as TiktokenModel);
      const adjustedContext = context.slice(0, cutAt);
      const taskPrompt = adjustedContext.slice(systemMessage.length);
      if (this.debug) {
        this.logger.debug(
          `context for task ${taskPrompt.slice(0, 32)}... got cut`
        );
      }
      return taskPrompt;
    }
    return context;
  }

  private updateUsage(usage: { [key: string]: number }) {
    this.usage = {
      completionTokens: usage["completion_tokens"],
      promptTokens: usage["prompt_tokens"],
      totalTokens: usage["total_tokens"],
    };
  }

  async setModel(model: Gen2ELLMAgentOpenAIModel) {
    this.model = model;
  }

  async getUsage() {
    return this.usage;
  }
}
