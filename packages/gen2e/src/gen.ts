import {
  classifyEvalError,
  defaultMakeIdentFromContext,
  estimateCostUsd,
  Gen2ECacheMissError,
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
import { z } from "zod";
import { config } from "./config";
import env from "./env";
import { Gen2EAssertionError, Gen2EGenError } from "./errors";
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
import { type Gen2EStepReturns, runStepAgent } from "./step-agent";
import { recordStepTelemetry } from "./telemetry";
import type {
  Gen2EAI,
  Gen2EGenContext,
  Gen2EGenOptions,
  Gen2EGenPolicies,
  Gen2ELadderOptions,
  Gen2ELLMCallHooks,
  Gen2EPlaywrightCodeEvalFunc,
  Gen2EVars,
  GenType,
  Page,
} from "./types";

type Gen2EStepInit = {
  task: string;
  page: Page;
  title: string;
  evalCode: Gen2EPlaywrightCodeEvalFunc;
  logger: Gen2ELogger;
  store?: StaticStore | null;
  hooks?: Gen2ELLMCallHooks;
  returns?: Gen2EStepReturns;
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
  vars?: Gen2EVars;
};

const returnsFor = (schema: z.ZodType): Gen2EStepReturns => ({
  jsonSchema: JSON.stringify(z.toJSONSchema(schema, { unrepresentable: "any" })),
  validate: (value) => {
    const res = schema.safeParse(value);
    return res.success ? undefined : z.prettifyError(res.error);
  },
});

export const assertTask = (task: string): string =>
  `Check whether this holds on the page: ${task}. Return true if it holds and false if it does not.`;

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
  { task, title, page, store, evalCode, logger, hooks, returns }: Gen2EStepInit,
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
    const keyTask = returns ? `${task}\n[returns ${returns.jsonSchema}]` : task;
    const cacheKey: StaticKeyContext = {
      testTitle: title,
      task: keyTask,
      pageUrl,
      model: modelId(options.model),
      promptVersion: GEN2E_PROMPT_VERSION,
    };
    testIdent =
      store?.makeIdentFromContext?.(cacheKey) ??
      store?.makeIdent(title, keyTask) ??
      defaultMakeIdentFromContext(cacheKey);

    if (store) {
      const expression = tryFetch(store, testIdent, { logger, testTask: task });
      if (expression) {
        let cachedResult: unknown;
        let failure: { error: unknown } | undefined;
        try {
          cachedResult = await evalCode(`${expression}`, page, options.vars);
        } catch (error) {
          failure = { error };
        }

        // A served entry that fails is a failed hit, not a miss.
        cache = "hit";

        if (!failure) {
          const mismatch = returns?.validate(cachedResult);
          if (mismatch) {
            throw new Gen2EStaleCacheError(testIdent, expression, {
              errorClass: "assertion",
              errorMessage: mismatch,
            });
          }
          outcome = "success";
          return cachedResult;
        }

        const evalErrorClass = classifyEvalError(failure.error);
        const stale = new Gen2EStaleCacheError(testIdent, expression, {
          errorClass: evalErrorClass,
          errorMessage:
            failure.error instanceof Error ? failure.error.message : String(failure.error),
        });

        if (
          options.replayOnly ||
          evalErrorClass !== "locator-drift" ||
          env.STALE_CACHE === "fail"
        ) {
          throw stale;
        }

        logger.debug("cached expression drifted, regenerating", {
          testIdent,
          errorClass: evalErrorClass,
        });
        cache = "stale-regen";
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
      visualInfoLevel: options.policies?.visualDebugLevel ?? "medium",
      ladder: options.ladder,
      snapshot: savedContext,
      snapshotRevision: savedContextRevision,
      debug: options.debug,
      saveScreenshots: options.debug,
      logger,
      hooks,
      vars: options.vars,
      returns,
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
  const globalConfig = config();
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
};

const defaultEvalCode: Gen2EPlaywrightCodeEvalFunc = (code, page, vars = {}) =>
  new Function(
    "page",
    "vars",
    `return (async () => { const result = await ${code}(); return result })()`,
  )(page, vars);

const mergeVars = (...all: (Gen2EVars | undefined)[]): Gen2EVars | undefined => {
  const vars = Object.assign({}, ...all);
  return Object.keys(vars).length ? vars : undefined;
};

const stepOptions = (options: Gen2EGenOptions | undefined): Gen2EStepOptions => {
  const globalConfig = config();
  return {
    debug: options?.debug ?? globalConfig.debug ?? env.DEBUG_MODE,
    model: options?.model ?? globalConfig.model ?? env.OPENAI_MODEL,
    openaiApiKey: options?.openaiApiKey ?? globalConfig.openaiApiKey,
    baseURL: options?.baseURL ?? globalConfig.baseURL ?? env.BASE_URL,
    policies: {
      maxRetries: options?.policies?.maxRetries ?? globalConfig.policies?.maxRetries ?? 3,
      screenshot: options?.policies?.screenshot ?? globalConfig.policies?.screenshot ?? "model",
      visualDebugLevel:
        options?.policies?.visualDebugLevel ?? globalConfig.policies?.visualDebugLevel ?? "medium",
    },
    saveContext: options?.saveContext ?? false,
    replayOnly: options?.replayOnly ?? globalConfig.replayOnly ?? env.REPLAY_ONLY,
    ladder: resolveLadder(options?.ladder),
    vars: mergeVars(globalConfig.vars, options?.vars),
  };
};

const activeStore = (ctx: Gen2EGenContext, store: StaticStore | null | undefined) =>
  store === null || !ctx.useStatic || !env.USE_STATIC_STORE ? null : (store ?? FSStaticStore);

type GenInit = {
  hooks?: Gen2ELLMCallHooks;
  store?: StaticStore | null;
  logger?: Gen2ELogger;
};

type Scope = {
  title: string;
  init?: GenInit;
  wrap?: <T>(task: string, fn: () => Promise<T>) => Promise<T>;
};

const run = (
  scope: Scope,
  task: string,
  page: Page,
  options: Gen2EGenOptions | undefined,
  evalCode: Gen2EPlaywrightCodeEvalFunc,
  returns?: Gen2EStepReturns,
): Promise<unknown> => {
  if (!page) {
    throw Error("gen2e needs a `page`.");
  }

  if (scope.init?.logger) {
    genContext.logger.config(scope.init.logger);
  }

  const fn = () =>
    step(
      {
        task,
        title: scope.title,
        page,
        store: activeStore(genContext, scope.init?.store),
        hooks: scope.init?.hooks,
        logger: genContext.logger,
        evalCode,
        returns,
      },
      stepOptions(options),
    );
  return scope.wrap ? scope.wrap(task, fn) : fn();
};

const extract = <S extends z.ZodType>(
  scope: Scope,
  task: string,
  page: Page,
  schema: S,
  options?: Gen2EGenOptions,
): Promise<z.output<S>> =>
  run(scope, task, page, options, defaultEvalCode, returnsFor(schema)).then((value) =>
    schema.parse(value),
  );

const assert = async (
  scope: Scope,
  task: string,
  page: Page,
  options?: Gen2EGenOptions,
): Promise<void> => {
  const holds = await run(
    scope,
    assertTask(task),
    page,
    options,
    defaultEvalCode,
    returnsFor(z.boolean()),
  );
  if (holds !== true) {
    throw new Gen2EAssertionError(task);
  }
};

export const bindAI = (page: Page, scope: Scope): Gen2EAI =>
  Object.assign(
    (task: string, options?: Gen2EGenOptions) => run(scope, task, page, options, defaultEvalCode),
    {
      extract: <S extends z.ZodType>(task: string, schema: S, options?: Gen2EGenOptions) =>
        extract(scope, task, page, schema, options),
      assert: (task: string, options?: Gen2EGenOptions) => assert(scope, task, page, options),
    },
  );

const _gen = Object.assign(
  (
    task: string,
    config: { page: Page },
    options?: Gen2EGenOptions,
    init?: GenInit,
    evalCode: Gen2EPlaywrightCodeEvalFunc = defaultEvalCode,
  ) => run({ title: "", init }, task, config.page, options, evalCode),
  {
    extract: <S extends z.ZodType>(
      task: string,
      config: { page: Page },
      schema: S,
      options?: Gen2EGenOptions,
      init?: GenInit,
    ): Promise<z.output<S>> => extract({ title: "", init }, task, config.page, schema, options),
    assert: (
      task: string,
      config: { page: Page },
      options?: Gen2EGenOptions,
      init?: GenInit,
    ): Promise<void> => assert({ title: "", init }, task, config.page, options),
  },
) as GenType;

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
