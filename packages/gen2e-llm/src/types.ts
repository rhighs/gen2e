import { Gen2ELogger } from "@rhighs/gen2e-logger";
import OpenAI from "openai";
import { JSONSchema } from "./jsonschema";

export type Gen2ELLMAgentTask = {
  task: string;
  image?: Buffer;
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
  task?: {
    prompt: string;
    output?: string;
    noToolCalls?: number;
  };
  completionTokens: number;
  promptTokens: number;
  totalTokens: number;
};

export type Gen2ELLMAgentHooks = {
  onMessage?: (
    message: OpenAI.Chat.Completions.ChatCompletionMessageParam
  ) => Promise<void> | void;
  onUsage?: (usage: Gen2ELLMAgentUsageStats) => Promise<void> | void;
};

export type Gen2ELLMAgent<T extends Gen2ELLMAgentTask, R> = (
  task: T,
  hooks?: Gen2ELLMAgentHooks
) => Promise<Gen2ELLMAgentResult<R>>;

export type Gen2ELLMAgentBuilderOptions = {
  debug?: boolean;
  openaiApiKey?: string;
};

export type Gen2ELLMCodeGenAgent = Gen2ELLMAgent<
  Gen2ELLMCodeGenAgentTask,
  string
>;

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
  defaultLang?: string
) => Agent;

export type Gen2ELLMAgentRunnerInit = {
  taskPrompt: string;
  systemMessage: string;
  image?: Buffer;
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
  run(init: Gen2ELLMAgentRunnerInit): Promise<Gen2ELLMAgentRunnerResult>;
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
} as const;

export const Gen2ELLMAgentModels = {
  ...Gen2ELLMAgentOpenAIModels,
} as const;

export type Gen2ELLMAgentOpenAIModel = keyof typeof Gen2ELLMAgentOpenAIModels;

export type Gen2ELLMAgentModel = keyof typeof Gen2ELLMAgentModels;

export interface Gen2LLMAgentTracedTool<T extends object>
  extends Gen2ELLMAgentTool<T> {
  callCount(): number;
}
