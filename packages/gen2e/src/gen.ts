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
import {
  type Gen2ELLMAgentModel,
  type Gen2ELLMAgentUsageStats,
  modelId,
  modelSupportsImage,
} from "@rhighs/gen2e-llm";
import type { Gen2ELogger } from "@rhighs/gen2e-logger";
import { FSStaticStore } from "@rhighs/gen2e-store";
import globalConfig from "./config";
import env from "./env";
import { Gen2EGenError, TestStepGenResultError } from "./errors";
import { FSWriter } from "./io";
import loggerInstance from "./logger";
import {
  createPlaywrightCodeGenAgent,
  GEN2E_PROMPT_VERSION,
  generatePlaywrightCode,
} from "./playwright-gen";
import {
  type DomRevision,
  getDomRevision,
  getSnapshot,
  installDomRevisionTracker,
  type WebSnapshotResult,
} from "./snapshot";
import { recordStepTelemetry } from "./telemetry";
import type {
  Gen2EEvalLoopInit,
  Gen2EEvalLoopOptions,
  Gen2EEvalLoopResult,
  Gen2EGenContext,
  Gen2EGenOptions,
  Gen2EGenPolicies,
  Gen2ELadderOptions,
  Gen2ELLMCallHooks,
  Gen2EPlaywriteCodeEvalFunc,
  Gen2EScreenshotUsagePolicy,
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
    snapshot: initialSnapshot,
    snapshotRevision: initialSnapshotRevision,
  }: Gen2EEvalLoopInit,
  { debug, model, visualInfoLevel, saveScreenshots, ladder }: Gen2EEvalLoopOptions,
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

  // DOM-only-first ladder: attempt 0 runs on the cheap model with screenshots
  // off (unless the policy is "force"), later attempts escalate to the
  // primary model and the configured policy.
  const ladderEnabled = !!ladder;
  const cheapModel = ladder?.cheapModel ?? _model;
  const cheapPolicy = ladder?.cheapScreenshot ?? (_spolicy === "force" ? "force" : "off");

  const attemptPlan = (attempt: number) => {
    const attemptModel = ladderEnabled && attempt === 0 ? cheapModel : _model;
    const attemptPolicy = ladderEnabled && attempt === 0 ? cheapPolicy : _spolicy;
    return {
      model: attemptModel,
      policy: attemptPolicy,
      useScreenshot: shouldScreenshot(attemptPolicy, { attempts: attempt, model: attemptModel }),
    };
  };

  await installDomRevisionTracker(page);

  let revision: DomRevision | undefined;
  const capturesWithOutlines = (useScreenshot: boolean): boolean =>
    useScreenshot && (visualInfoLevel === "medium" || visualInfoLevel === "high");

  const captureSnapshot = async (useScreenshot: boolean): Promise<WebSnapshotResult> => {
    // The capture injects outline styles and debug tags when screenshots are
    // taken with visual debugging, and those count as mutations. Only a
    // capture that does not mutate the dom on its own can safely read the
    // baseline before capturing; otherwise external mutations happening while
    // the snapshot is taken would be folded into it.
    const beforeCapture = capturesWithOutlines(useScreenshot)
      ? undefined
      : await getDomRevision(page);

    const captured = await getSnapshot(page, debug ? logger : undefined, {
      debug,
      screenshot: useScreenshot,
      pageDataTags: useScreenshot && visualInfoLevel === "high",
      pageOutlines: useScreenshot && (visualInfoLevel === "medium" || visualInfoLevel === "high"),
      saveScreenShot: useScreenshot && saveScreenshots,

      // FIXME: temporarily set to medium, infer usage based on difficulty of the task at hand.
      stripLevel: "medium",
    });

    revision = beforeCapture ?? (await getDomRevision(page));
    return captured;
  };

  // Capture once per step. A caller-provided snapshot (saveContext) is reused
  // as-is, with its revision recorded right away.
  let snapshot: WebSnapshotResult;
  if (initialSnapshot) {
    snapshot = initialSnapshot;
    revision = initialSnapshotRevision ?? (await getDomRevision(page));
  } else {
    snapshot = await captureSnapshot(attemptPlan(0).useScreenshot);
  }

  for (let _r = 0; _r < retries; ++_r) {
    const plan = attemptPlan(_r);

    const result = await generatePlaywrightCode({
      agent: ctx.agent,
      task: {
        task: task,
        domSnapshot: snapshot.dom,
        pageScreenshot: plan.useScreenshot ? snapshot.screenshot : undefined,
        previousErrors: errors.map((e, i) => `${i}. ${e.toString().slice(0, 300)}`).join("\n"),
        previousAttempts: attempts.map((a, i) => `${i}. ${a}`).join("\n"),
        options: {
          model: plan.model,
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

      // generation-level failure: the existing capture is still valid, but the
      // next attempt may need a screenshot the current capture lacks
      const next = attemptPlan(_r + 1);
      const needsScreenshot = next.useScreenshot && !snapshot.screenshot;
      if (needsScreenshot) {
        snapshot = await captureSnapshot(next.useScreenshot);
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
        attempts: _r + 1,
        result: {
          evalResult: evalResult,
          expression: result.result,
        },
      };
    } catch (error) {
      attempts.push(expression);
      errors.push(error);

      // The eval may have moved the DOM. Re-capture only when it did, or when
      // the screenshot policy now needs an image the current capture lacks.
      const currentRevision = await getDomRevision(page);
      const moved =
        revision === undefined ||
        currentRevision.navigations !== revision.navigations ||
        currentRevision.mutations !== revision.mutations;

      const next = attemptPlan(_r + 1);
      const needsScreenshot = next.useScreenshot && !snapshot.screenshot;
      if (moved || needsScreenshot) {
        snapshot = await captureSnapshot(next.useScreenshot);
      }
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
    attempts: retries,
  };
};

const step = async (
  ctx: Gen2EGenContext,
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
          // The entry existed and was served: a failure here is a failed hit,
          // not a miss.
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

    const result = await evalLoop(
      ctx,
      {
        task,
        page,
        evalCode,
        policies: options.policies,
        snapshot: savedContext,
        snapshotRevision: savedContextRevision,
      },
      {
        debug: options.debug,
        model: options.model,
        saveScreenshots: options.debug,
        visualInfoLevel:
          options?.policies?.visualDebugLevel ??
          globalConfig.policies?.visualDebugLevel ??
          "medium",
        ladder: options.ladder,
      },
      {
        ...(hooks ?? {}),
        onUsage: async (usage) => {
          usageStats.push(usage);
          if (hooks?.onUsage) {
            await hooks.onUsage(usage);
          }
        },
      },
    );

    attempts = result.attempts ?? 0;

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

/**
 * Normalizes the ladder option: explicit `false` disables it, `true` keeps
 * the primary model and only turns screenshots off first, an object may name
 * the cheap model, and otherwise the config file or `GEN2E_CHEAP_MODEL`
 * enable it.
 */
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

  // An explicit config `ladder: false` is a hard disable, even when a cheap
  // model is configured: config takes precedence over env and defaults.
  if (globalConfig.ladder === false) {
    return undefined;
  }

  if (globalConfig.ladder === true || configuredCheapModel) {
    return { cheapModel: configuredCheapModel };
  }

  return undefined;
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
      // Library errors carry identity and metadata consumers match on; do not
      // bury them inside a generic Error.
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
