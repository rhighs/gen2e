import OpenAI from "openai";
import {
  Gen2ELLMAgentHooks,
  Gen2ELLMAgentOpenAIModel,
  Gen2ELLMAgentRunner,
  Gen2ELLMAgentRunnerInit,
  Gen2ELLMAgentRunnerResult,
} from "../types";
import { fitsContext, maxCharactersApprox } from "./openai-token";
import { TiktokenModel } from "tiktoken";
import { Gen2ELogger, makeLogger } from "@rhighs/gen2e-logger";

export const modelSupportsImage = (
  model: Gen2ELLMAgentOpenAIModel
): boolean => {
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

export type Gen2EOpenAIRunnerOptions = {
  apiKey: string;
  model: Gen2ELLMAgentOpenAIModel;
  debug?: boolean;
  openai?: OpenAI;
  logger?: Gen2ELogger;
  baseURL?: string;
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
    baseURL,
  }: Gen2EOpenAIRunnerOptions) {
    this.openai = openai ?? new OpenAI({ apiKey, baseURL });
    this.model = model;
    this.debug = debug;
    this.usage = { completionTokens: 0, promptTokens: 0, totalTokens: 0 };
    this.logger = makeLogger("GEN2E-LLM-AGENT-RUNNER");
    if (logger) {
      this.logger.config(logger);
    }
  }

  async run(
    { taskPrompt, systemMessage, images, tools = [] }: Gen2ELLMAgentRunnerInit,
    hooks?: Gen2ELLMAgentHooks
  ): Promise<Gen2ELLMAgentRunnerResult> {
    if (images && !modelSupportsImage(this.model)) {
      return {
        type: "error",
        reason: "model does not supporting feeding images",
      };
    }

    const makePromptImage = (
      image: Buffer
    ): {
      type: "image_url";
      image_url: {
        url: string;
      };
    } => {
      const imageb64 = image.toString("base64");
      if (this.debug) {
        this.logger.debug(
          `runner sending jpeg image ${imageb64.substring(0, 32)}...`
        );
      }

      return {
        type: "image_url",
        image_url: {
          url: `data:image/jpeg;base64,${imageb64}`,
        },
      };
    };

    const content: OpenAI.Chat.ChatCompletionContentPart[] = [
      { type: "text", text: taskPrompt },
    ];

    if (images) {
      const promptImages = images.map((image) => makePromptImage(image));
      content.concat(promptImages);

      // FIXME: this is really wrong as images might still make the prompt exceed the context window limits.
      taskPrompt = this.adjustContext(
        taskPrompt,
        systemMessage,
        promptImages.map((i) => i.image_url.url).join("")
      );
    } else {
      taskPrompt = this.adjustContext(taskPrompt, systemMessage);
    }

    if (this.debug) {
      this.logger.debug("openai runner started using context", {
        taskPrompt,
        systemMessage,
      });
    }

    try {
      const runner = this.openai.beta.chat.completions
        .runTools({
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
        })
        .on("message", (message) => {
          if (hooks?.onMessage) {
            hooks.onMessage(message);
          }
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

  private adjustContext(
    task: string,
    systemMessage: string,
    image?: string
  ): string {
    const context = task + systemMessage + (image ?? "");
    if (!fitsContext(this.model as TiktokenModel, context)) {
      const max = maxCharactersApprox(this.model as TiktokenModel);
      const mustCut = context.length - max;
      const taskPrompt = context.slice(0, task.length - mustCut);
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
