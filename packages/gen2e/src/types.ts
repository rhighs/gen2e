import type { Page } from "@playwright/test";
import type { StaticStore } from "@rhighs/gen2e-core";
import type { Gen2ELLMAgentHooks, Gen2ELLMAgentModel } from "@rhighs/gen2e-llm";
import type { Gen2ELogger } from "@rhighs/gen2e-logger";
import type { z } from "zod";

export type { Page };

export type Gen2EScreenshotUsagePolicy = "force" | "model" | "onfail" | "off";

export type Gen2EVisualDebugLevel = "none" | "medium" | "high";

export type Gen2EGenPolicies = {
  screenshot?: Gen2EScreenshotUsagePolicy;
  visualDebugLevel?: Gen2EVisualDebugLevel;
  maxRetries?: number;
};

/** The first attempt runs on `cheapModel` with `cheapScreenshot` ("off" unless the policy is "force"). */
export type Gen2ELadderOptions = {
  cheapModel?: Gen2ELLMAgentModel;
  cheapScreenshot?: Gen2EScreenshotUsagePolicy;
};

export type Gen2EGenOptions = {
  debug?: boolean;
  model?: Gen2ELLMAgentModel;
  openaiApiKey?: string;
  baseURL?: string;
  policies?: Gen2EGenPolicies;
  saveContext?: boolean;
  /** Also enabled by `GEN2E_CHEAP_MODEL` or the config file. */
  ladder?: boolean | Gen2ELadderOptions;
  /** A cache miss throws `Gen2ECacheMissError`; nothing is generated or written. */
  replayOnly?: boolean;
  /** Values for `{{name}}` placeholders in the task. The model sees the names only and reads values from `vars`. */
  vars?: Gen2EVars;
};

export type Gen2EVars = Record<string, string>;

export type Gen2EPlaywrightCodeEvalFunc = (
  code: string,
  p: Page,
  vars?: Gen2EVars,
) => Promise<any> | any;

export interface Gen2EGenContext {
  logger: Gen2ELogger;
  useStatic: boolean;
}

export interface GenType extends GenFunction, Gen2EGenContext {}

export type { StaticGenStep, StaticGenStepRefs } from "@rhighs/gen2e-core";

export type Gen2EExpression = {
  task: string;
  expression: string;
};

export type Gen2ELLMCallHooks = Gen2ELLMAgentHooks;

type GenInit = {
  store?: StaticStore | null;
  hooks?: Gen2ELLMCallHooks;
  logger?: Gen2ELogger;
};

export interface GenFunction {
  (
    task: string,
    config: { page: Page },
    options?: Gen2EGenOptions,
    init?: GenInit,
    evalCode?: Gen2EPlaywrightCodeEvalFunc,
  ): Promise<any>;
  extract<S extends z.ZodType>(
    task: string,
    config: { page: Page },
    schema: S,
    options?: Gen2EGenOptions,
    init?: GenInit,
  ): Promise<z.output<S>>;
  assert(
    task: string,
    config: { page: Page },
    options?: Gen2EGenOptions,
    init?: GenInit,
  ): Promise<void>;
}

export type Gen2EConfig = {
  staticStorePath?: string;
  openaiApiKey?: string;
  baseURL?: string;
  debug?: boolean;
  model?: Gen2ELLMAgentModel;
  policies?: Gen2EGenPolicies;
  replayOnly?: boolean;
  cheapModel?: Gen2ELLMAgentModel;
  ladder?: boolean;
};

export interface Gen2EAI {
  (task: string, options?: Gen2EGenOptions): Promise<unknown>;
  extract<S extends z.ZodType>(
    task: string,
    schema: S,
    options?: Gen2EGenOptions,
  ): Promise<z.output<S>>;
  assert(task: string, options?: Gen2EGenOptions): Promise<void>;
}
