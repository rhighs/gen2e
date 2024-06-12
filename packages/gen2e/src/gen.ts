import { Gen2ELLMAgentModel, modelSupportsImage } from "@rhighs/gen2e-llm";
import { Gen2ELogger } from "@rhighs/gen2e-logger";
import env from "./env";
import { Gen2EGenError, TestStepGenResultError } from "./errors";
import {
  createPlaywrightCodeGenAgent,
  generatePlaywrightCode,
} from "./playwright-gen";
import { getSnapshot } from "./snapshot";
import { FSStaticStore } from "./static/store/fs";
import { StaticStore } from "./static/store/store";
import {
  Gen2EGenContext,
  Gen2EGenOptions,
  Gen2ELLMCallHooks,
  Gen2EPlaywriteCodeEvalFunc,
  Gen2EScreenshotUsagePolicy,
  type GenStepFunction,
  type GenType,
  type Page,
  type PlaywrightTestFunction,
  type Test,
  type TestFunction,
} from "./types";
import loggerInstance from "./logger";
import globalConfig from "./config";

const tryFetch = (
  store: StaticStore,
  testTitle: string,
  testTask: string,
  {
    logger,
  }: {
    logger: Gen2ELogger;
  }
): string | undefined => {
  const staticStep = store.fetchStatic(store.makeIdent(testTitle, testTask));
  if (
    staticStep?.expression &&
    typeof staticStep?.expression === "string" &&
    staticStep?.expression.length > 0 &&
    staticStep.expression !== "undefined"
  ) {
    const expression = staticStep?.expression;
    if (env.LOG_STEP) {
      logger.info("found static expression for task", {
        testTask,
        expression,
      });
    }
    return expression;
  }
  return undefined;
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
};

export type Gen2EEvalLoopResult =
  | {
      type: "error";
      errors: Error[];
    }
  | {
      type: "success";
      result: {
        expression: string;
        evalResult: any;
      };
    };

export type Gen2EEvalLoopOptions = {
  model?: string;
  debug?: boolean;
  visualInfoLevel?: "none" | "medium" | "high";
  saveScreenshots?: boolean;
};

const evalLoop = async (
  ctx: Gen2EGenContext,
  {
    task,
    page,
    policies = {
      maxRetries: 3,
      screenshot: "off",
    },
    evalCode,
  }: Gen2EEvalLoopInit,
  { debug, model, visualInfoLevel, saveScreenshots }: Gen2EEvalLoopOptions,
  hooks?: Gen2ELLMCallHooks
): Promise<Gen2EEvalLoopResult> => {
  if (!ctx.agent) {
    throw new TestStepGenResultError("agent instance cannot be left undefined");
  }

  const logger = ctx.logger;
  const retries = policies.maxRetries ?? 3;
  const errors: Error[] = [];
  const attempts: string[] = [];

  const _spolicy = policies.screenshot ?? "model";
  const _model = (model ?? env.OPENAI_MODEL) as Gen2ELLMAgentModel;
  logger.debug('using model',_model);

  const shouldScreenshot = (
    policy: Gen2EScreenshotUsagePolicy,
    params: {
      attempts: number;
      model: Gen2ELLMAgentModel;
    }
  ): boolean => {
    if (modelSupportsImage(params.model)) {
      if (policy === "model") {
        return true;
      }

      if (policy === "onfail" && params.attempts > 0) {
        return true;
      }
    }

    return policy === "force";
  };

  for (let _r = 0; _r < retries; ++_r) {
    const useScreenshot = shouldScreenshot(_spolicy, {
      attempts: _r,
      model: _model,
    });
    const domInfo = await getSnapshot(page, debug ? logger : undefined, {
      debug,
      screenshot: useScreenshot,
      pageDataTags: useScreenshot && visualInfoLevel === "high",
      pageOutlines:
        useScreenshot &&
        (visualInfoLevel === "medium" || visualInfoLevel === "high"),
      saveScreenShot: useScreenshot && saveScreenshots,

      // FIXME: temporarily set to medium, infer usage based on difficulty of the task at hand.
      stripLevel: "medium",
    });
    const result = await generatePlaywrightCode({
      agent: ctx.agent,
      task: {
        task: task,
        domSnapshot: domInfo.dom,
        pageScreenshot: domInfo.screenshot,
        previousErrors: errors
          .map((e, i) => `${i}. ${e.toString().slice(0, 300)}`)
          .join("\n"),
        previousAttempts: attempts.map((a, i) => `${i}. ${a}`).join("\n"),
        options: {
          model: _model,
        },
      },
      hooks: {
        ...(hooks ?? {}),
        onMessage: (message) => {
          if (debug) {
            logger.debug(
              `[event] on message >>> ${JSON.stringify(message, null, 4)}`
            );
          }

          if (hooks?.onMessage) {
            hooks.onMessage(message);
          }
        },
      },
    });

    if (result.type === "error") {
      if (debug) {
        ctx.logger.error(
          `eval loop failed attempt ${_r} with screenshot policy "${_spolicy}"`,
          result.errorMessage
        );
      }
      continue;
    }

    const expression = result.result;
    if (env.LOG_STEP) {
      ctx.logger.info("evaluating", { task, expression });
    }

    try {
      const evalResult = await evalCode(`${expression}`, page);
      return {
        type: "success",
        result: {
          evalResult: evalResult,
          expression: result.result,
        },
      };
    } catch (error) {
      attempts.push(expression);
      errors.push(error);
      continue;
    }
  }

  if (debug) {
    ctx.logger.error(
      `failed generating a valid playwright expression in ${retries} attemps`,
      errors
    );
  }

  return {
    type: "error",
    errors,
  };
};

const genContext: Gen2EGenContext = {
  agent: undefined,
  useStatic: env.USE_STATIC_STORE,
  logger: loggerInstance,
  screenshot: "model",
};

const _gen: GenType = (
  async function (
    this: GenType,
    task: string,
    config: {
      page: Page;
    },
    options?: Gen2EGenOptions,
    init?: {
      hooks?: Gen2ELLMCallHooks;
      store?: StaticStore;
      logger?: Gen2ELogger;
    },
    evalCode: Gen2EPlaywriteCodeEvalFunc = (code: string, page: Page) =>
      new Function(
        "page",
        `return (async () => { const result = await ${code}(); return result })()`
      )(page)
  ): Promise<any> {
    if (!config || !config.page) {
      throw Error(
        "The gen() function is missing the required `{ page }` argument."
      );
    }
    const page = config.page;
    const isDebug = options?.debug ?? globalConfig.debug ?? env.DEBUG_MODE;
    if (init?.logger) {
      this.logger.config(init.logger);
    }
    const logger = this.logger;

    const store = init?.store ?? FSStaticStore;
    if (!store) {
      logger.warn(
        "found explicitly null static store init config, disabling static store..."
      );
      this.useStatic = false;
    }

    if (!this.agent) {
      this.agent = createPlaywrightCodeGenAgent(
        env.OPENAI_MODEL as Gen2ELLMAgentModel,
        {
          openaiApiKey: options?.openaiApiKey ?? globalConfig.openaiApiKey,
          debug: isDebug,
        },
        logger
      );
    }

    if (store && this.useStatic) {
      const expression = tryFetch(store, "", task, { logger });
      if (expression) {
        return evalCode(`${expression}`, page);
      }
    }

    if (env.LOG_STEP) {
      logger.info("generating playwright expression with task", { task });
    }

    const result = await evalLoop(
      this,
      {
        task,
        page,
        evalCode,
        policies: {
          maxRetries:
            options?.policies?.maxRetries ??
            globalConfig.policies?.maxRetries ??
            3,
          screenshot:
            options?.policies?.screenshot ??
            globalConfig.policies?.screenshot ??
            "model",
        },
      },
      {
        debug: isDebug,
        model: options?.model ?? globalConfig.model ?? env.OPENAI_MODEL,
        saveScreenshots: isDebug,
        visualInfoLevel:
          options?.policies?.visualDebugLevel ??
          globalConfig.policies?.visualDebugLevel ??
          "medium",
      },
      init?.hooks
    );

    if (result.type == "error") {
      throw new Gen2EGenError(result.errors.join("\n"));
    }

    const { expression, evalResult } = result.result;

    if (env.LOG_STEP) {
      logger.info("evaluating", { task, expression });
    }

    if (store && this.useStatic) {
      const _static = {
        ident: store.makeIdent("", task),
        expression: expression,
      };
      if (isDebug) {
        logger.debug("storing static", _static);
      }
      store?.makeStatic(_static);
    }
    return evalResult;
  } as GenType
).bind(genContext);

_gen.test = function (
  this: GenType,
  testFunction: TestFunction,
  init?: {
    store?: StaticStore;
    hooks?: Gen2ELLMCallHooks;
    logger?: Gen2ELogger;
  }
): PlaywrightTestFunction {
  const self = this;
  if (init?.logger) {
    this.logger.config(init.logger);
  }
  const logger = self.logger;

  return async ({ page, context, request }, testInfo): Promise<void> => {
    const { title } = testInfo;

    const store = init?.store ?? FSStaticStore;
    if (!store) {
      logger.warn(
        "found explicitly null static store init config, disabling static store..."
      );
      self.useStatic = false;
    }

    const gen: GenStepFunction = async (
      task: string,
      config: {
        page: Page;
        test: Test;
      },
      options?: Gen2EGenOptions,
      evalCode: Gen2EPlaywriteCodeEvalFunc = (code: string, page: Page) =>
        new Function(
          "page",
          `return (async () => { const result = await ${code}(); return result })()`
        )(page)
    ): Promise<any> => {
      if (!config || !config.page) {
        throw Error(
          "The gen() function is missing the required `{ page }` argument."
        );
      }

      if (!config.test) {
        throw Error(
          "The gen() function is missing the required `{ test }` argument."
        );
      }

      const { test, page } = config;
      const isDebug = options?.debug ?? globalConfig.debug ?? env.DEBUG_MODE;

      if (!self.agent) {
        logger.debug("creating agent...");
        self.agent = createPlaywrightCodeGenAgent(
          env.OPENAI_MODEL as Gen2ELLMAgentModel,
          {
            openaiApiKey: options?.openaiApiKey ?? globalConfig.openaiApiKey,
            debug: isDebug,
          },
          logger
        );
      }

      return await test.step(task, async () => {
        const testIdent = store.makeIdent(title, task);
        if (store && this.useStatic) {
          const expression = tryFetch(store, title, task, { logger });
          if (expression) {
            return evalCode(`${expression}`, page);
          }
        }

        if (env.LOG_STEP) {
          logger.info("generating playwright expression with task", { task });
        }

        const result = await evalLoop(
          this,
          {
            task,
            page,
            evalCode,
            policies: {
              maxRetries:
                options?.policies?.maxRetries ??
                globalConfig.policies?.maxRetries ??
                3,
              screenshot:
                options?.policies?.screenshot ??
                globalConfig.policies?.screenshot ??
                "model",
            },
          },
          {
            debug: isDebug,
            model: options?.model ?? globalConfig.model ?? env.OPENAI_MODEL,
            saveScreenshots: isDebug,
            visualInfoLevel:
              options?.policies?.visualDebugLevel ??
              globalConfig.policies?.visualDebugLevel ??
              "medium",
          },
          init?.hooks
        );

        if (result.type == "error") {
          throw new Gen2EGenError(result.errors.join("\n"));
        }

        const { expression, evalResult } = result.result;

        if (env.LOG_STEP) {
          logger.info("evaluating", { task, expression });
        }

        if (self.useStatic) {
          const _static = {
            ident: testIdent,
            expression,
          };
          if (isDebug) {
            logger.debug("storing static", _static);
          }
          store.makeStatic(_static);
        }
        return evalResult;
      });
    };

    try {
      const result = await testFunction(
        {
          page,
          gen,
          context: context,
          request: request,
        },
        testInfo
      );
      return result;
    } catch (err) {
      throw new Error(`gen.test failed with error: ${err}`);
    }
  };
};

_gen.test = _gen.test.bind(genContext);

export const configureLogger = (logger: Gen2ELogger) => {
  genContext.logger = logger;
};

Object.defineProperty(_gen, "useStatic", {
  get() {
    return genContext.useStatic;
  },
  set(value) {
    genContext.useStatic = value;
  },
});

export const gen = _gen;
