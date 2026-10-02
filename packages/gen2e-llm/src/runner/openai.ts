import { type Gen2ELogger, makeLogger } from "@rhighs/gen2e-logger";
import OpenAI from "openai";
import type { TiktokenModel } from "tiktoken";
import { modelSupportsImage } from "../models";
import type {
  Gen2ELLMAgentHooks,
  Gen2ELLMAgentRunner,
  Gen2ELLMAgentRunnerInit,
  Gen2ELLMAgentRunnerResult,
} from "../types";
import { fitsContext, maxCharactersApprox } from "./openai-token";

export type Gen2EOpenAIRunnerOptions = {
  apiKey: string;
  model: string;
  debug?: boolean;
  openai?: OpenAI;
  logger?: Gen2ELogger;
  baseURL?: string;
};

export class Gen2EOpenAIRunner implements Gen2ELLMAgentRunner {
  private openai: OpenAI;
  private model: string;
  private debug: boolean;
  private logger: Gen2ELogger;
  private usage: {
    completionTokens: number;
    promptTokens: number;
    totalTokens: number;
  };

  constructor({ apiKey, model, debug = false, openai, logger, baseURL }: Gen2EOpenAIRunnerOptions) {
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
    hooks?: Gen2ELLMAgentHooks,
  ): Promise<Gen2ELLMAgentRunnerResult> {
    if (images?.length && !modelSupportsImage(this.model)) {
      return {
        type: "error",
        reason: "model does not supporting feeding images",
      };
    }

    const imageUrls = (images ?? []).map((image) => {
      const imageb64 = image.toString("base64");
      if (this.debug) {
        this.logger.debug(`runner sending jpeg image ${imageb64.substring(0, 32)}...`);
      }
      return `data:image/jpeg;base64,${imageb64}`;
    });

    const task = this.adjustContext(taskPrompt, systemMessage);

    const content: OpenAI.Chat.ChatCompletionContentPart[] = [{ type: "text", text: task }];
    for (const url of imageUrls) {
      content.push({
        type: "image_url",
        image_url: {
          url,
        },
      });
    }

    if (this.debug) {
      this.logger.debug("openai runner started using context", {
        taskPrompt: task,
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
      const reason = err instanceof Error ? err.message : String(err);
      return { type: "error", reason: `got error ${reason}` };
    }
  }

  /**
   * Trims the task when task + system message exceed the model context window.
   * Image payloads are deliberately not counted here: base64 length grossly
   * overestimates vision token cost, and providers report a clear error when
   * an image is genuinely too large.
   */
  private adjustContext(task: string, systemMessage: string): string {
    const context = task + systemMessage;
    if (!fitsContext(this.model as TiktokenModel, context)) {
      const max = maxCharactersApprox(this.model as TiktokenModel);
      const mustCut = context.length - max;
      const taskPrompt = task.slice(0, Math.max(0, task.length - mustCut));
      if (this.debug) {
        this.logger.debug(`context for task ${taskPrompt.slice(0, 32)}... got cut`);
      }
      return taskPrompt;
    }
    return task;
  }

  private updateUsage(usage: { [key: string]: number }) {
    this.usage = {
      completionTokens: usage.completion_tokens,
      promptTokens: usage.prompt_tokens,
      totalTokens: usage.total_tokens,
    };
  }

  async setModel(model: string) {
    this.model = model;
  }

  async getUsage() {
    return this.usage;
  }
}
