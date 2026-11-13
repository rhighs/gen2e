import {
  classifyEvalError,
  defaultMakeIdentFromContext,
  estimateCostUsd,
  Gen2ECacheMissError,
  Gen2EError,
  Gen2EStaleCacheError,
  type Gen2EStepTelemetry,
  type StaticGenStep,
  type StaticGenStepRefs,
  type StaticKeyContext,
  type StaticStore,
  wrapIdent,
} from "@rhighs/gen2e-core";
import { type Gen2ELLMAgentModel, type Gen2ELLMAgentUsageStats, modelId } from "@rhighs/gen2e-llm";
import type { Gen2ELogger } from "@rhighs/gen2e-logger";
import { FSStaticStore } from "@rhighs/gen2e-store";
import globalConfig from "./config";
import env from "./env";
import { Gen2EGenError } from "./errors";
import { FSWriter } from "./io";
import loggerInstance from "./logger";
import { GEN2E_PROMPT_VERSION } from "./playwright-gen";
import {
  type DomRevision,
  getDomRevision,
  getSnapshot,
  installDomRevisionTracker,
  type WebSnapshotResult,
} from "./snapshot";
import { runStepAgent } from "./step-agent";
import { recordStepTelemetry } from "./telemetry";
import type {
  Gen2EGenContext,
  Gen2EGenOptions,
  Gen2EGenPolicies,
  Gen2ELadderOptions,
  Gen2ELLMCallHooks,
  Gen2EPlaywriteCodeEvalFunc,
  GenStepFunction,
  GenType,
  Page,
  PlaywrightTestFunction,
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
  ladder?: Gen2ELadderOptions;
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

const step = async (
  { task, title, page, store, evalCode, logger, hooks }: Gen2EStepInit,
  options: Gen2EStepOptions,
) => {
  const startedAt = Date.now();
  title = title ?? "";
  store = store === null ? undefined : (store ?? FSStaticStore);

  const usageStats: Gen2ELLMAgentUsageStats[] = [];
  let testIdent = "";
  let cache: Gen2EStepTelemetry["cache"] = store ? "miss" : "disabled";
  let attempts = 0;
  let outcome: Gen2EStepTelemetry["outcome"] = "error";
  let errorClass: string | undefined;

  try {
    await installDomRevisionTracker(page);
    const pageUrl = page.url();
    const cacheKey: StaticKeyContext = {
      testTitle: title,
      task,
      pageUrl,
      model: modelId(options.model),
      promptVersion: GEN2E_PROMPT_VERSION,
    };
    testIdent =
      store?.makeIdentFromContext?.(cacheKey) ??
      store?.makeIdent(title, task) ??
      defaultMakeIdentFromContext(cacheKey);

    if (store) {
      const expression = tryFetch(store, testIdent, { logger, testTask: task });
      if (expression) {
        try {
          const cachedResult = await evalCode(`${expression}`, page);
          cache = "hit";
          outcome = "success";
          return cachedResult;
        } catch (error) {
          // A served entry that fails is a failed hit, not a miss.
          cache = "hit";
          const evalErrorClass = classifyEvalError(error);
          const stale = new Gen2EStaleCacheError(testIdent, expression, {
            errorClass: evalErrorClass,
            errorMessage: error instanceof Error ? error.message : String(error),
          });

          if (options.replayOnly) {
            throw stale;
          }

          if (evalErrorClass === "locator-drift" && env.STALE_CACHE !== "fail") {
            logger.debug("cached expression drifted, regenerating", {
              testIdent,
              errorClass: evalErrorClass,
            });
            cache = "stale-regen";
          } else {
            throw stale;
          }
        }
      }
    }

    if (options.replayOnly) {
      cache = "replay";
      throw new Gen2ECacheMissError(testIdent);
    }

    if (env.LOG_STEP) {
      logger.info("generating playwright expression with task", { task });
    }

    let savedContext: WebSnapshotResult | undefined;
    let savedContextRevision: DomRevision | undefined;
    if (options?.saveContext) {
      savedContextRevision = await getDomRevision(page);
      savedContext = await getSnapshot(page, options.debug ? logger : undefined, {
        debug: options.debug,
        screenshotFullPage: true,
        screenshot: true,
        stripLevel: "medium",
      });
    }

    const result = await runStepAgent({
      task,
      page,
      evalCode,
      model: options.model,
      endpoint: { apiKey: options.openaiApiKey, baseURL: options.baseURL },
      maxEvals: options.policies?.maxRetries ?? 3,
      screenshot: options.policies?.screenshot ?? "model",
      visualInfoLevel:
        options.policies?.visualDebugLevel ?? globalConfig.policies?.visualDebugLevel ?? "medium",
      ladder: options.ladder,
      snapshot: savedContext,
      snapshotRevision: savedContextRevision,
      debug: options.debug,
      saveScreenshots: options.debug,
      logger,
      hooks,
    });

    usageStats.push(...result.usage);
    attempts = result.attempts;

    if (result.type === "error") {
      throw new Gen2EGenError(result.errors.join("\n"));
    }

    const { expression, evalResult } = result;

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
        store.makeStatic(
          testIdent,
          _static,
          cache === "stale-regen" ? { overwrite: true } : undefined,
        );
      } catch (err) {
        if (options.replayOnly) {
          throw err;
        }
        logger.warn("failed to persist static generation step, continuing without cache", err);
      }
    }

    outcome = "success";
    return evalResult;
  } catch (err) {
    errorClass = err instanceof Error ? err.constructor.name : typeof err;
    throw err;
  } finally {
    const promptTokens = usageStats.reduce((acc, usage) => acc + (usage.promptTokens ?? 0), 0);
    const completionTokens = usageStats.reduce(
      (acc, usage) => acc + (usage.completionTokens ?? 0),
      0,
    );
    const totalTokens = usageStats.reduce((acc, usage) => acc + (usage.totalTokens ?? 0), 0);
    const models = [
      ...new Set(
        usageStats.map((usage) => usage.model).filter((model): model is string => !!model),
      ),
    ];

    let costUsd: number | undefined;
    for (const usage of usageStats) {
      const cost = estimateCostUsd(usage.model, {
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
      });
      if (cost !== undefined) {
        costUsd = (costUsd ?? 0) + cost;
      }
    }

    recordStepTelemetry({
      ts: new Date().toISOString(),
      testTitle: title,
      task,
      ident: testIdent,
      cache,
      outcome,
      attempts,
      models: models.length > 0 ? models : [modelId(options.model)],
      toolCalls: usageStats.reduce((acc, usage) => acc + (usage.task?.noToolCalls ?? 0), 0),
      promptTokens,
      completionTokens,
      totalTokens,
      wallClockMs: Date.now() - startedAt,
      screenshotPolicy: options.policies?.screenshot ?? "model",
      promptVersion: GEN2E_PROMPT_VERSION,
      ...(costUsd !== undefined ? { costUsd } : {}),
      ...(errorClass ? { errorClass } : {}),
    });
  }
};

const resolveLadder = (ladder: Gen2EGenOptions["ladder"]): Gen2ELadderOptions | undefined => {
  const configuredCheapModel =
    globalConfig.cheapModel ??
    (env.CHEAP_MODEL && env.CHEAP_MODEL.trim() !== "" ? env.CHEAP_MODEL : undefined);

  if (ladder === false) {
    return undefined;
  }

  if (ladder === true) {
    return { cheapModel: configuredCheapModel };
  }

  if (ladder && typeof ladder === "object") {
    return {
      cheapModel: ladder.cheapModel ?? configuredCheapModel,
      cheapScreenshot: ladder.cheapScreenshot,
    };
  }

  // Config `ladder: false` wins over a cheap model set in the env.
  if (globalConfig.ladder === false) {
    return undefined;
  }

  if (globalConfig.ladder === true || configuredCheapModel) {
    return { cheapModel: configuredCheapModel };
  }

  return undefined;
};

const genContext: Gen2EGenContext = {
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
        ladder: resolveLadder(options?.ladder),
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
            ladder: resolveLadder(options?.ladder),
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
      // Consumers match on library error types and metadata, so these are not wrapped.
      if (err instanceof Gen2EError) {
        throw err;
      }
      throw new Error(`gen.test failed with error: ${err}`, { cause: err });
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
