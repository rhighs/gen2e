import type { Page, PlaywrightTestArgs, TestInfo as PwTestInfo, TestType } from "@playwright/test";
import type { StaticStore } from "@rhighs/gen2e-core";
import type { Gen2ELLMAgentHooks, Gen2ELLMAgentModel } from "@rhighs/gen2e-llm";
import type { Gen2ELogger } from "@rhighs/gen2e-logger";

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
};

export type Test = TestType<any, any>;

export type GenFixtures = Pick<PlaywrightTestArgs, "page" | "context" | "request">;

export type TestArgs = GenFixtures & { gen: GenStepFunction };

export type TestInfo = PwTestInfo;

export type PlaywrightTestFunction = (
  args: GenFixtures,
  testInfo: PwTestInfo,
) => Promise<void> | void;

export type TestFunction = (args: TestArgs, testInfo: TestInfo) => Promise<void> | void;

export type Gen2EPlaywrightCodeEvalFunc = (code: string, p: Page) => Promise<any> | any;

export interface Gen2EGenContext {
  logger: Gen2ELogger;
  useStatic: boolean;
}

export interface GenType extends GenFunction, Gen2EGenContext {
  test: GenTestFunction;
}

export type { StaticGenStep, StaticGenStepRefs } from "@rhighs/gen2e-core";

export type Gen2EExpression = {
  task: string;
  expression: string;
};

export type Gen2ELLMCallHooks = Gen2ELLMAgentHooks;

export type GenFunction = (
  task: string,
  config: { page: Page },
  options?: Gen2EGenOptions,
  init?: {
    store?: StaticStore | null;
    hooks?: Gen2ELLMCallHooks;
    logger?: Gen2ELogger;
  },
  evalCode?: Gen2EPlaywrightCodeEvalFunc,
) => Promise<any>;

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

export type GenTestFunction = (
  testFunction: TestFunction,
  init?: {
    store?: StaticStore | null;
    hooks?: Gen2ELLMCallHooks;
    logger?: Gen2ELogger;
  },
) => PlaywrightTestFunction;

export type GenStepFunction = (
  task: string,
  config: { page: Page; test: Test },
  options?: Gen2EGenOptions,
  evalCode?: Gen2EPlaywrightCodeEvalFunc,
) => Promise<any>;
