import OpenAI from "openai";

export type Gen2ELLMAgentTask = {
  task: string;
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

export type Gen2ELLMAgentBuilder<Agent extends object> = (
  systemMessage: string,
  model: Gen2ELLMAgentModel,
  options?: Gen2ELLMAgentBuilderOptions
) => Agent;

export type Gen2ELLMAgentRunnerInit = {
  taskPrompt: string;
  systemMessage: string;
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

export type Gen2ELLMAgentOpenAIModel =
  | "gpt-3.5-turbo"
  | "gpt-3.5-turbo-0125"
  | "gpt-3.5-turbo-0301"
  | "gpt-3.5-turbo-0613"
  | "gpt-3.5-turbo-1106"
  | "gpt-3.5-turbo-16k"
  | "gpt-3.5-turbo-16k-0613"
  | "gpt-4"
  | "gpt-4-1106-preview"
  | "gpt-4-turbo-preview"
  | "gpt-4-turbo"
  | "gpt-4-turbo-2024-04-09"
  | "gpt-4o"
  | "gpt-4o-2024-05-13";

export type Gen2ELLMAgentModel = Gen2ELLMAgentOpenAIModel;
