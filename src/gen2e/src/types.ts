import {
  TestInfo as PlayrightTestInfo,
  type PlaywrightTestArgs,
  type TestType,
} from "@playwright/test";

export { type Page };
import { type Page } from "@playwright/test";
import { StaticStore } from "./static/store/store";
import OpenAI from "openai";

export type ModelOptions = {
  debug?: boolean;
  model?: string;
  openaiApiKey?: string;
};

export type TaskMessage = {
  task: string;
  options?: ModelOptions;
};

export type TaskResult<T> =
  | {
      type: "error";
      errorMessage: string;
    }
  | {
      type: "success";
      result: T;
    };

export type Gen2ELLMUsageStats = {
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

export type Gen2ELLMCallHooks = {
  onMessage?: (
    message: OpenAI.Chat.Completions.ChatCompletionMessageParam
  ) => Promise<void> | void;
  onUsage?: (usage: Gen2ELLMUsageStats) => Promise<void> | void;
};

export type Gen2ELLMCall<T extends TaskMessage, R> = (
  task: T,
  hooks?: Gen2ELLMCallHooks,
  openai?: OpenAI
) => Promise<TaskResult<R>>;

export type Test = TestType<any, any>;
export type TestArgs = PlaywrightTestArgs & { gen: GenStepFunction };
export type TestInfo = PlayrightTestInfo;

export type PlaywrightTestFunction = (
  args: PlaywrightTestArgs,
  testInfo: PlayrightTestInfo
) => Promise<void> | void;

export type TestFunction = (
  args: TestArgs,
  testInfo: TestInfo
) => Promise<void> | void;

export type Gen2EPlaywriteCodeEvalFunc = (
  code: string,
  p: Page
) => Promise<any> | any;

export interface GenFunction {
  (
    task: string,
    config: { page: Page },
    options?: ModelOptions,
    init?: {
      store?: StaticStore;
      hooks?: Gen2ELLMCallHooks;
    },
    evalCode?: Gen2EPlaywriteCodeEvalFunc
  ): Promise<any>;
}

export type GenTestFunction = (
  testFunction: TestFunction,
  init?: {
    store?: StaticStore;
    hooks?: Gen2ELLMCallHooks;
  }
) => PlaywrightTestFunction;

export type GenStepFunction = (
  task: string,
  config: { page: Page; test: Test },
  options?: ModelOptions,
  evalCode?: Gen2EPlaywriteCodeEvalFunc
) => Promise<any>;

export interface GenType extends GenFunction {
  test: GenTestFunction;
  useStatic: boolean;
}

export type StaticGenStep = {
  ident: string;
  expression: string;
};

export type Gen2EExpression = {
  task: string;
  expression: string;
};
