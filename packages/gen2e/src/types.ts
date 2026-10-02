import type { TestInfo as PlayrightTestInfo, PlaywrightTestArgs, TestType } from "@playwright/test";

export type { Page };

import type { Page } from "@playwright/test";
import type { StaticStore } from "@rhighs/gen2e-core";
import type {
  Gen2ELLMAgentHooks,
  Gen2ELLMAgentModel,
  Gen2ELLMCodeGenAgent,
} from "@rhighs/gen2e-llm";
import type { Gen2ELogger } from "@rhighs/gen2e-logger";
import type { DomRevision, WebSnapshotResult } from "./snapshot";

export type Gen2EScreenshotUsagePolicy = "force" | "model" | "onfail" | "off";
export type Gen2EVisualDebugLevel = "none" | "medium" | "high";

export type Gen2EGenPolicies = {
  screenshot?: Gen2EScreenshotUsagePolicy;
  visualDebugLevel?: Gen2EVisualDebugLevel;
  maxRetries?: number;
};

/**
 * DOM-only-first ladder settings. The first attempt runs on `cheapModel`
 * (falling back to the primary model) with `cheapScreenshot` (default
 * "off", unless the configured policy is "force"); later attempts run on the
 * primary model with the configured policy.
 */
export type Gen2ELadderOptions = {
  cheapModel?: Gen2ELLMAgentModel;
  cheapScreenshot?: Gen2EScreenshotUsagePolicy;
};

export type Gen2EGenOptions = {
  debug?: boolean;
  /**
   * Model id served by the OpenAI-compatible endpoint (OpenAI or any
   * compatible API).
   */
  model?: Gen2ELLMAgentModel;
  openaiApiKey?: string;
  /** Base URL of the OpenAI-compatible endpoint. */
  baseURL?: string;
  policies?: Gen2EGenPolicies;
  saveContext?: boolean;
  /**
   * DOM-only-first cost ladder. `true` starts on the primary model with
   * screenshots off and escalates to the configured policy after a failure;
   * an object can name a cheaper model and a screenshot policy for the
   * first attempt. Also enabled by `GEN2E_CHEAP_MODEL` or the config file.
   */
  ladder?: boolean | Gen2ELadderOptions;
  /**
   * Serve exclusively from the static store. A cache miss throws
   * `Gen2ECacheMissError`; no snapshot, generation or write happens.
   */
  replayOnly?: boolean;
};

export type Test = TestType<any, any>;
export type TestArgs = PlaywrightTestArgs & { gen: GenStepFunction };
export type TestInfo = PlayrightTestInfo;

export type PlaywrightTestFunction = (
  args: PlaywrightTestArgs,
  testInfo: PlayrightTestInfo,
) => Promise<void> | void;

export type TestFunction = (args: TestArgs, testInfo: TestInfo) => Promise<void> | void;

export type Gen2EPlaywriteCodeEvalFunc = (code: string, p: Page) => Promise<any> | any;

export interface Gen2EGenContext {
  agent?: Gen2ELLMCodeGenAgent;
  logger: Gen2ELogger;
  useStatic: boolean;
  screenshot?: Gen2EScreenshotUsagePolicy;
}

export interface GenType extends GenFunction, Gen2EGenContext {
  test: GenTestFunction;
}

export type { StaticGenStep, StaticGenStepRefs } from "@rhighs/gen2e-core";

export type Gen2EExpression = {
  task: string;
  expression: string;
};

export type Gen2EEvalLoopPolicies = {
  screenshot?: Gen2EScreenshotUsagePolicy;
  maxRetries?: number;
};

export type Gen2EEvalLoopInit = {
  task: string;
  page: Page;
  policies: Gen2EEvalLoopPolicies;
  evalCode: Gen2EPlaywriteCodeEvalFunc;
  /**
   * Optional snapshot captured by the caller, reused as the first capture so
   * a step never pays for two captures.
   */
  snapshot?: WebSnapshotResult;
  /**
   * DOM revision observed right before the caller-provided snapshot was
   * captured. When present it is used as the reuse baseline so mutations that
   * happen while the caller captures are not folded into it.
   */
  snapshotRevision?: DomRevision;
};

export type Gen2EEvalLoopResult =
  | {
      type: "error";
      errors: Error[];
      attempts?: number;
    }
  | {
      type: "success";
      result: {
        expression: string;
        evalResult: any;
      };
      attempts?: number;
    };

export type Gen2EEvalLoopOptions = {
  model?: Gen2ELLMAgentModel;
  debug?: boolean;
  visualInfoLevel?: "none" | "medium" | "high";
  saveScreenshots?: boolean;
  ladder?: Gen2ELadderOptions;
};

export type Gen2ELLMCallHooks = Gen2ELLMAgentHooks;

/**
 * A standalone generation function, does not need a test instance.
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
export type GenFunction = (
  task: string,
  config: { page: Page },
  options?: Gen2EGenOptions,
  init?: {
    store?: StaticStore | null;
    hooks?: Gen2ELLMCallHooks;
    logger?: Gen2ELogger;
  },
  evalCode?: Gen2EPlaywriteCodeEvalFunc,
) => Promise<any>;

/**
 * Gen2E library configuration options.
 * @param {string} staticStorePath - The path use by the file system store used to preserve generated code.
 * @param {string} openaiApiKey - API key for openai services.
 * @param {debug} boolean - Enable debug mode, severe logging.
 * @param {model} string - Model to be used among all available.
 * @param {policies} Gen2EGenPolicies - Code generation agent policies.
 */
export type Gen2EConfig = {
  staticStorePath?: string;
  openaiApiKey?: string;
  /** Base URL of the OpenAI-compatible endpoint. */
  baseURL?: string;
  debug?: boolean;
  model?: Gen2ELLMAgentModel;
  policies?: Gen2EGenPolicies;
  /** Serve exclusively from the static store, never generating or writing. */
  replayOnly?: boolean;
  /** Cheaper model used for the first ladder attempt when the ladder is on. */
  cheapModel?: string;
  /** Enable the DOM-only-first cost ladder by default. */
  ladder?: boolean;
};

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
    store?: StaticStore | null;
    hooks?: Gen2ELLMCallHooks;
    logger?: Gen2ELogger;
  },
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
  evalCode?: Gen2EPlaywriteCodeEvalFunc,
) => Promise<any>;
