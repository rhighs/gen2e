import {
  type Page,
  type Test,
  type TestFunction,
  type GenType,
  type GenStepFunction,
  type PlaywrightTestFunction,
  Gen2EPlaywriteCodeEvalFunc,
  Gen2ELLMCallHooks,
  Gen2EGenOptions,
} from "./types";
import {
  createPlaywrightCodeGenAgent,
  generatePlaywrightCode,
} from "./playwright-gen";
import { PlainGenResultError, TestStepGenResultError } from "./errors";
import { getSnapshot } from "./snapshot";
import { StaticStore } from "./static/store/store";
import env from "./env";
import { FSStaticStore } from "./static/store/fs";
import { Gen2ELLMAgentModel } from "@rhighs/gen2e-llm";
import { Gen2ELogger, makeLogger } from "@rhighs/gen2e-logger";

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

const genContext = {
  useStatic: env.USE_STATIC_STORE,
  logger: makeLogger("GEN2E-LIB"),
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
    const isDebug = options?.debug ?? env.DEBUG_MODE;
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
          openaiApiKey: options?.openaiApiKey,
          debug: isDebug,
        },
        logger
      );
    }

    let expression: string | undefined;
    if (store && this.useStatic) {
      if ((expression = tryFetch(store, "", task, { logger }))) {
        return evalCode(`${expression}`, page);
      }
    }

    if (env.LOG_STEP) {
      logger.info("generating playwright expression with task", { task });
    }
    {
      const domInfo = await getSnapshot(page, isDebug ? logger : undefined, {
        debug: isDebug,
        screenshot: true,
      });
      const result = await generatePlaywrightCode({
        agent: this.agent,
        task,
        domSnapshot: domInfo.dom,
        pageScreenshot: domInfo.screenshot,
        options: {
          model: (options?.model as Gen2ELLMAgentModel) ?? undefined,
        },
        hooks: {
          ...(init?.hooks ?? {}),
          onMessage: (message) => {
            if (isDebug) {
              logger.debug(`[agent-ai:event] on message >>>`, message);
            }
            if (init?.hooks?.onMessage) {
              init.hooks.onMessage(message);
            }
          },
        },
      });

      if (result.type == "error") {
        throw new PlainGenResultError(result.errorMessage);
      }

      expression = result.result;
    }
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

    return evalCode(`${expression}`, page);
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
      const isDebug = options?.debug ?? env.DEBUG_MODE;

      const testIdent = store.makeIdent(title, task);
      let expression: string | undefined;
      if (this.useStatic) {
        if ((expression = tryFetch(store, title, task, { logger }))) {
          return evalCode(`${expression}`, page);
        }
      }

      return await test.step(task, async () => {
        let expression = "";
        if (!self.agent) {
          logger.debug("creating agent...");
          self.agent = createPlaywrightCodeGenAgent(
            env.OPENAI_MODEL as Gen2ELLMAgentModel,
            {
              openaiApiKey: options?.openaiApiKey,
              debug: isDebug,
            },
            logger
          );
        }

        if (env.LOG_STEP) {
          logger.info("generating playwright expression with task", { task });
        }
        {
          const domInfo = await getSnapshot(
            page,
            isDebug ? logger : undefined,
            {
              debug: isDebug,
              screenshot: true,
            }
          );

          const result = await generatePlaywrightCode({
            agent: self.agent,
            task,
            domSnapshot: domInfo.dom,
            pageScreenshot: domInfo.screenshot,
            options: {
              model: (options?.model as Gen2ELLMAgentModel) ?? undefined,
            },
            hooks: {
              ...(init?.hooks ?? {}),
              onMessage: (message) => {
                if (isDebug) {
                  logger.debug(
                    `[event] on message >>> ${JSON.stringify(message, null, 4)}`
                  );
                }

                if (init?.hooks?.onMessage) {
                  init.hooks.onMessage(message);
                }
              },
            },
          });

          if (result.type === "error") {
            test.fail();
            throw new TestStepGenResultError(result.errorMessage);
          }

          expression = result.result;
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
        }
        if (env.LOG_STEP) {
          logger.info("evaluating", { task, expression });
        }

        const evalResult = await evalCode(`${expression}`, page);
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
      throw new Error("gen.test failed with error: ", err);
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
