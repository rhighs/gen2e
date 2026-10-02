import { type Gen2ELLMAgentModel, modelId, modelSupportsImage } from "@rhighs/gen2e-llm";
import type { Gen2ELogger } from "@rhighs/gen2e-logger";
import globalConfig from "./config";
import env from "./env";
import { Gen2ECacheMissError, Gen2EGenError, TestStepGenResultError } from "./errors";
import { FSWriter } from "./io";
import loggerInstance from "./logger";
import {
  createPlaywrightCodeGenAgent,
  GEN2E_PROMPT_VERSION,
  generatePlaywrightCode,
} from "./playwright-gen";
import { getSnapshot, type WebSnapshotResult } from "./snapshot";
import { defaultMakeIdentFromContext, wrapIdent } from "./static/ident";
import { FSStaticStore } from "./static/store/fs";
import type { StaticKeyContext, StaticStore } from "./static/store/store";
import type {
  Gen2EEvalLoopInit,
  Gen2EEvalLoopOptions,
  Gen2EEvalLoopResult,
  Gen2EGenContext,
  Gen2EGenOptions,
  Gen2EGenPolicies,
  Gen2ELLMCallHooks,
  Gen2EPlaywriteCodeEvalFunc,
  Gen2EScreenshotUsagePolicy,
  GenStepFunction,
  GenType,
  Page,
  PlaywrightTestFunction,
  StaticGenStep,
  StaticGenStepRefs,
  Test,
  TestFunction,
} from "./types";

type Gen2EStepInit = {
  task: string;
  page: Page;
  title: string;
  evalCode: Gen2EPlaywriteCodeEvalFunc;
  logger: Gen2ELogger;
  store?: StaticStore | null;
  hooks?: Gen2ELLMCallHooks;
};

type Gen2EStepOptions = {
  debug: boolean;
  model: Gen2ELLMAgentModel;
  saveContext: boolean;
  policies: Gen2EGenPolicies;
  replayOnly: boolean;
  openaiApiKey?: string;
  baseURL?: string;
};

const tryFetch = (
  store: StaticStore,
  ident: string,
  {
    logger,
    testTask,
  }: {
    logger: Gen2ELogger;
    testTask?: string;
  },
): string | undefined => {
  const staticStep = store.fetchStatic(ident);
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
  llmhooks?: Gen2ELLMCallHooks,
): Promise<Gen2EEvalLoopResult> => {
  if (!ctx.agent) {
    throw new TestStepGenResultError("agent instance cannot be left undefined");
  }

  const logger = ctx.logger;
  const retries = policies.maxRetries ?? 3;
  const errors: Error[] = [];
  const attempts: string[] = [];

  const _spolicy = policies.screenshot ?? "model";
  const _model = model ?? env.OPENAI_MODEL;

  const shouldScreenshot = (
    policy: Gen2EScreenshotUsagePolicy,
    params: {
      attempts: number;
      model: Gen2ELLMAgentModel;
    },
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

  let snapshot: WebSnapshotResult;
  for (let _r = 0; _r < retries; ++_r) {
    const useScreenshot = shouldScreenshot(_spolicy, {
      attempts: _r,
      model: _model,
    });

    snapshot = await getSnapshot(page, debug ? logger : undefined, {
      debug,
      screenshot: useScreenshot,
      pageDataTags: useScreenshot && visualInfoLevel === "high",
      pageOutlines: useScreenshot && (visualInfoLevel === "medium" || visualInfoLevel === "high"),
      saveScreenShot: useScreenshot && saveScreenshots,

      // FIXME: temporarily set to medium, infer usage based on difficulty of the task at hand.
      stripLevel: "medium",
    });

    const result = await generatePlaywrightCode({
      agent: ctx.agent,
      task: {
        task: task,
        domSnapshot: snapshot.dom,
        pageScreenshot: snapshot.screenshot,
        previousErrors: errors.map((e, i) => `${i}. ${e.toString().slice(0, 300)}`).join("\n"),
        previousAttempts: attempts.map((a, i) => `${i}. ${a}`).join("\n"),
        options: {
          model: _model,
        },
      },
      hooks: {
        ...(llmhooks ?? {}),
        onMessage: (message) => {
          if (debug) {
            logger.debug(`[event] on message >>> ${JSON.stringify(message, null, 4)}`);
          }

          if (llmhooks?.onMessage) {
            llmhooks.onMessage(message);
          }
        },
      },
    });

    if (result.type === "error") {
      if (debug) {
        ctx.logger.error(
          `eval loop failed attempt ${_r} with screenshot policy "${_spolicy}"`,
          result.errorMessage,
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
    }
  }

  if (debug) {
    ctx.logger.error(
      `failed generating a valid playwright expression in ${retries} attemps`,
      errors,
    );
  }

  return {
    type: "error",
    errors,
  };
};

const step = async (
  ctx: Gen2EGenContext,
  { task, title, page, store, evalCode, logger, hooks }: Gen2EStepInit,
  options: Gen2EStepOptions,
) => {
  title = title ?? "";
  store = store === null ? undefined : (store ?? FSStaticStore);

  const pageUrl = page.url();
  const cacheKey: StaticKeyContext = {
    testTitle: title,
    task,
    pageUrl,
    model: modelId(options.model),
    promptVersion: GEN2E_PROMPT_VERSION,
  };
  const testIdent =
    store?.makeIdentFromContext?.(cacheKey) ??
    store?.makeIdent(title, task) ??
    defaultMakeIdentFromContext(cacheKey);

  if (store) {
    const expression = tryFetch(store, testIdent, { logger, testTask: task });
    if (expression) {
      return evalCode(`${expression}`, page);
    }
  }

  if (options.replayOnly) {
    throw new Gen2ECacheMissError(testIdent);
  }

  if (!ctx.agent) {
    logger.debug("creating agent...");
    ctx.agent = createPlaywrightCodeGenAgent(
      options.model,
      {
        openaiApiKey: options?.openaiApiKey,
        baseURL: options?.baseURL,
        debug: options.debug,
        promptVersion: GEN2E_PROMPT_VERSION,
      },
      logger,
    );
  }

  if (env.LOG_STEP) {
    logger.info("generating playwright expression with task", { task });
  }

  let savedContext: WebSnapshotResult | undefined;
  if (options?.saveContext) {
    savedContext = await getSnapshot(page, options.debug ? logger : undefined, {
      debug: options.debug,
      screenshotFullPage: true,
      screenshot: true,
      stripLevel: "medium",
    });
  }

  const result = await evalLoop(
    ctx,
    {
      task,
      page,
      evalCode,
      policies: options.policies,
    },
    {
      debug: options.debug,
      model: options.model,
      saveScreenshots: options.debug,
      visualInfoLevel:
        options?.policies?.visualDebugLevel ?? globalConfig.policies?.visualDebugLevel ?? "medium",
    },
    hooks,
  );

  if (result.type === "error") {
    throw new Gen2EGenError(result.errors.join("\n"));
  }

  const { expression, evalResult } = result.result;

  if (env.LOG_STEP) {
    logger.info("evaluating", { task, expression });
  }

  if (store) {
    const refs: StaticGenStepRefs = { pageUrl };
    const _static: StaticGenStep = {
      expression,
      context: {
        task,
        testTitle: title,
        refs,
      },
    };

    if (options.saveContext && savedContext) {
      const ident = wrapIdent(testIdent);
      const htmlFile = `${ident}.gen.html`;
      const jpgFile = `${ident}.gen.jpg`;

      const [htmlPath, jpgPath] = await Promise.all([
        FSWriter.write(htmlFile, savedContext.dom),
        FSWriter.write(jpgFile, savedContext.screenshot ?? Buffer.from([])),
      ]);

      refs.htmlPath = htmlPath;
      refs.screenshotPath = jpgPath;

      if (options.debug) {
        logger.debug("saved web context data at", [htmlPath, jpgPath]);
      }
    }

    _static.meta = {
      generatedAt: new Date().toISOString(),
      model: modelId(options.model),
      promptVersion: GEN2E_PROMPT_VERSION,
      pageUrl,
      ...(savedContext ? { domFingerprint: wrapIdent(savedContext.dom) } : {}),
    };

    if (options.debug) {
      logger.debug("storing static", _static);
    }

    try {
      store.makeStatic(testIdent, _static);
    } catch (err) {
      if (options.replayOnly) {
        throw err;
      }
      logger.warn("failed to persist static generation step, continuing without cache", err);
    }
  }

  return evalResult;
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
      store?: StaticStore | null;
      logger?: Gen2ELogger;
    },
    evalCode: Gen2EPlaywriteCodeEvalFunc = (code: string, page: Page) =>
      new Function(
        "page",
        `return (async () => { const result = await ${code}(); return result })()`,
      )(page),
  ): Promise<any> {
    if (!config?.page) {
      throw Error("The gen() function is missing the required `{ page }` argument.");
    }
    const page = config.page;
    const isDebug = options?.debug ?? globalConfig.debug ?? env.DEBUG_MODE;
    if (init?.logger) {
      this.logger.config(init.logger);
    }
    const logger = this.logger;

    const store = init?.store === undefined ? FSStaticStore : init.store;
    if (store === null) {
      logger.warn("found explicitly null static store init config, disabling static store...");
      this.useStatic = false;
    }

    return await step(
      this,
      {
        task,
        title: "",
        page,
        store: this.useStatic && env.USE_STATIC_STORE ? store : null,
        hooks: init?.hooks,
        logger,
        evalCode,
      },
      {
        debug: isDebug,
        model: options?.model ?? globalConfig.model ?? env.OPENAI_MODEL,
        openaiApiKey: options?.openaiApiKey ?? globalConfig.openaiApiKey,
        baseURL: options?.baseURL ?? globalConfig.baseURL ?? env.BASE_URL,
        policies: {
          maxRetries: options?.policies?.maxRetries ?? globalConfig.policies?.maxRetries ?? 3,
          screenshot: options?.policies?.screenshot ?? globalConfig.policies?.screenshot ?? "model",
        },
        saveContext: options?.saveContext ?? false,
        replayOnly: options?.replayOnly ?? globalConfig.replayOnly ?? env.REPLAY_ONLY,
      },
    );
  } as GenType
).bind(genContext);

_gen.test = function (
  this: GenType,
  testFunction: TestFunction,
  init?: {
    store?: StaticStore | null;
    hooks?: Gen2ELLMCallHooks;
    logger?: Gen2ELogger;
  },
): PlaywrightTestFunction {
  if (init?.logger) {
    this.logger.config(init.logger);
  }
  const logger = this.logger;

  return async ({ page, context, request }, testInfo): Promise<void> => {
    const { title } = testInfo;

    const store = init?.store === undefined ? FSStaticStore : init.store;
    if (store === null) {
      logger.warn("found explicitly null static store init config, disabling static store...");
      this.useStatic = false;
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
          `return (async () => { const result = await ${code}(); return result })()`,
        )(page),
    ): Promise<any> => {
      if (!config?.page) {
        throw Error("The gen() function is missing the required `{ page }` argument.");
      }

      const { test, page } = config;
      const isDebug = options?.debug ?? globalConfig.debug ?? env.DEBUG_MODE;

      return await test.step(task, async () => {
        return await step(
          this,
          {
            task,
            title,
            page,
            store: this.useStatic && env.USE_STATIC_STORE ? store : null,
            hooks: init?.hooks,
            logger,
            evalCode,
          },
          {
            debug: isDebug,
            model: options?.model ?? globalConfig.model ?? env.OPENAI_MODEL,
            openaiApiKey: options?.openaiApiKey ?? globalConfig.openaiApiKey,
            baseURL: options?.baseURL ?? globalConfig.baseURL ?? env.BASE_URL,
            policies: {
              maxRetries: options?.policies?.maxRetries ?? globalConfig.policies?.maxRetries ?? 3,
              screenshot:
                options?.policies?.screenshot ?? globalConfig.policies?.screenshot ?? "model",
            },
            saveContext: options?.saveContext ?? false,
            replayOnly: options?.replayOnly ?? globalConfig.replayOnly ?? env.REPLAY_ONLY,
          },
        );
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
        testInfo,
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
