import type { Gen2ELogger } from "@rhighs/gen2e-logger";
import type { JSONSchema } from "./jsonschema";

export type Gen2ELLMAgentTask = {
  task: string;
  images?: Buffer[];
  options?: {
    model?: Gen2ELLMAgentModel;
  };
};

export type Gen2ELLMAgentResult<T> =
  | {
      type: "error";
      errorMessage: string;
    }
  | {
      type: "success";
      result: T;
    };

export type Gen2ELLMCodeGenAgentTask = Gen2ELLMAgentTask & {
  codeContext?: string;
  previousErrors?: string;
  previousAttempts?: string;
};

export type Gen2ELLMAgentUsageStats = {
  model: string;
  promptVersion?: string;
  task?: {
    prompt: string;
    output?: string;
    noToolCalls?: number;
  };
  completionTokens: number;
  promptTokens: number;
  totalTokens: number;
};

/**
 * Chat message surfaced to agent hooks. OpenAI chat completion messages
 * satisfy this shape.
 */
export type Gen2ELLMAgentMessage = {
  role: string;
  content?: unknown;
};

export type Gen2ELLMAgentHooks = {
  onMessage?: (message: Gen2ELLMAgentMessage) => Promise<void> | void;
  onUsage?: (usage: Gen2ELLMAgentUsageStats) => Promise<void> | void;
};

export type Gen2ELLMAgent<T extends Gen2ELLMAgentTask, R> = (
  task: T,
  hooks?: Gen2ELLMAgentHooks,
) => Promise<Gen2ELLMAgentResult<R>>;

export type Gen2ELLMAgentBuilderOptions = {
  debug?: boolean;
  /** API key for OpenAI or the OpenAI-compatible endpoint. */
  openaiApiKey?: string;
  /**
   * Base URL of an OpenAI-compatible endpoint, e.g. a self-hosted proxy or
   * vendor API. Falls back to OPENAI_BASE_URL when omitted.
   */
  baseURL?: string;
  /**
   * Version of the system prompt used by this agent. Reported back in usage
   * stats so callers can invalidate caches when the prompt changes.
   */
  promptVersion?: string;
};

export type Gen2ELLMCodeGenAgent = Gen2ELLMAgent<Gen2ELLMCodeGenAgentTask, string>;

export type Gen2ELLMAgentTool<Args extends object> = {
  function: (args: Args) => Promise<any> | any;
  description: string;
  name: string;
  parameters: JSONSchema;
  parse: (args: string) => any;
};

export type Gen2ELLMAgentBuilder<Agent extends object> = (
  systemMessage: string,
  model: Gen2ELLMAgentModel,
  options?: Gen2ELLMAgentBuilderOptions,
  logger?: Gen2ELogger,
  tools?: Gen2ELLMAgentTool<{ code?: string; [key: string]: any }>[],
  defaultLang?: string,
) => Agent;

export type Gen2ELLMAgentRunnerInit = {
  taskPrompt: string;
  systemMessage: string;
  images?: Buffer[];
  tools?: any[];
  options?: {
    model?: Gen2ELLMAgentModel;
  };
};

export type Gen2ELLMAgentRunnerResult =
  | {
      type: "success";
      result: string;
    }
  | {
      type: "error";
      reason: string;
    };

export interface Gen2ELLMAgentRunner {
  run(
    init: Gen2ELLMAgentRunnerInit,
    hooks?: Gen2ELLMAgentHooks,
  ): Promise<Gen2ELLMAgentRunnerResult>;
  getUsage(): Promise<{
    completionTokens: number;
    promptTokens: number;
    totalTokens: number;
  }>;
}

export const Gen2ELLMAgentOpenAIModels = {
  "gpt-3.5-turbo": true,
  "gpt-3.5-turbo-0125": true,
  "gpt-3.5-turbo-0301": true,
  "gpt-3.5-turbo-0613": true,
  "gpt-3.5-turbo-1106": true,
  "gpt-3.5-turbo-16k": true,
  "gpt-3.5-turbo-16k-0613": true,
  "gpt-4": true,
  "gpt-4-vision-preview": true,
  "gpt-4-1106-preview": true,
  "gpt-4-turbo-preview": true,
  "gpt-4-turbo": true,
  "gpt-4-turbo-2024-04-09": true,
  "gpt-4o": true,
  "gpt-4o-2024-05-13": true,
  "gpt-4o-mini": true,
  "gpt-4.1": true,
  "gpt-4.1-mini": true,
  "gpt-4.1-nano": true,
  "gpt-5": true,
  "gpt-5-mini": true,
  "gpt-5-nano": true,
  o3: true,
  "o3-mini": true,
  "o4-mini": true,
} as const;

export const Gen2ELLMAgentModels = {
  ...Gen2ELLMAgentOpenAIModels,
} as const;

export type Gen2ELLMAgentOpenAIModel = keyof typeof Gen2ELLMAgentOpenAIModels;

/**
 * A model id served by the configured OpenAI-compatible endpoint. Known
 * OpenAI ids are offered for autocomplete; any non-empty string is accepted
 * because the endpoint decides which models exist.
 */
export type Gen2ELLMAgentModel = Gen2ELLMAgentOpenAIModel | (string & {});

export interface Gen2LLMAgentTracedTool<T extends object> extends Gen2ELLMAgentTool<T> {
  callCount(): number;
}
