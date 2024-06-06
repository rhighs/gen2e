import {
  TestInfo as PlayrightTestInfo,
  type PlaywrightTestArgs,
  type TestType,
} from "@playwright/test";

export { type Page };
import { type Page } from "@playwright/test";
import { StaticStore } from "./static/store/store";
import { Gen2ELLMAgentHooks, Gen2ELLMCodeGenAgent } from "@rhighs/gen2e-llm";
import { Gen2ELogger } from "@rhighs/gen2e-logger";

export type ModelOptions = {
  debug?: boolean;
  model?: string;
};

export type Gen2EScreenshotUsagePolicy = "force" | "model" | "onfail" | "off";
export type Gen2EVisualDebugLevel = "none" | "medium" | "high";

export type Gen2EGenPolicies = {
  screenshot?: Gen2EScreenshotUsagePolicy;
  visualDebugLevel?: Gen2EVisualDebugLevel;
  maxRetries?: number;
};

export type Gen2EGenOptions = {
  debug?: boolean;
  model?: string;
  openaiApiKey?: string;
  policies?: Gen2EGenPolicies;
};

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

export interface Gen2EGenContext {
  agent?: Gen2ELLMCodeGenAgent;
  logger: Gen2ELogger;
  useStatic: boolean;
  screenshot?: Gen2EScreenshotUsagePolicy;
}

export interface GenType extends GenFunction, Gen2EGenContext {
  test: GenTestFunction;
}

export type StaticGenStep = {
  ident: string;
  expression: string;
};

export type Gen2EExpression = {
  task: string;
  expression: string;
};

export type Gen2ELLMCallHooks = Gen2ELLMAgentHooks;

/**
 * A standalone generation function, does not need a test instance.
 * @param {string} task - The task description.
 * @param {Object} config - The configuration object.
 * @param {Page} config.page - The Playwright page object.
 * @param {ModelOptions} [options] - Optional model options.
 * @param {Object} [init] - Optional initialization object.
 * @param {Gen2ELLMCallHooks} [init.hooks] - Optional hooks for the generation process.
 * @param {StaticStore} [init.store] - Optional static store for caching expressions.
 * @param {Gen2EPlaywriteCodeEvalFunc} [evalCode] - Optional function to evaluate the code.
 * @returns {Promise<any>} The result of the evaluation.
 * @throws Will throw an error if the `config` object or `config.page` is missing.
 */
export interface GenFunction {
  (
    task: string,
    config: { page: Page },
    options?: ModelOptions,
    init?: {
      store?: StaticStore;
      hooks?: Gen2ELLMCallHooks;
      logger?: Gen2ELogger;
    },
    evalCode?: Gen2EPlaywriteCodeEvalFunc
  ): Promise<any>;
}

/**
 * Playwright test function wrapper, allowing the use of gen inside a test case.
 * @param {TestFunction} testFunction - The test function to execute.
 * @param {Object} [init] - Optional initialization object.
 * @param {StaticStore} [init.store] - Optional static store for caching expressions.
 * @param {Gen2ELLMCallHooks} [init.hooks] - Optional hooks for the generation process.
 * @returns {PlaywrightTestFunction} The Playwright test function.
 */
export type GenTestFunction = (
  testFunction: TestFunction,
  init?: {
    store?: StaticStore;
    hooks?: Gen2ELLMCallHooks;
    logger?: Gen2ELogger;
  }
) => PlaywrightTestFunction;

/**
 * Generation function, generates static code and caches it to FS by default.
 * @param {string} task - The task description.
 * @param {Object} config - The configuration object.
 * @param {Page} config.page - The Playwright page object.
 * @param {Gen2EGenOptions} [options] - Optional model options.
 * @param {Object} [init] - Optional initialization object.
 * @param {Gen2ELLMCallHooks} [init.hooks] - Optional hooks for the generation process.
 * @param {StaticStore} [init.store] - Optional static store for caching expressions.
 * @param {Gen2EPlaywriteCodeEvalFunc} [evalCode] - Optional function to evaluate the code.
 * @returns {Promise<any>} The result of the evaluation.
 * @throws Will throw an error if the `config` object or `config.page` is missing.
 */
export type GenStepFunction = (
  task: string,
  config: { page: Page; test: Test },
  options?: Gen2EGenOptions,
  evalCode?: Gen2EPlaywriteCodeEvalFunc
) => Promise<any>;
