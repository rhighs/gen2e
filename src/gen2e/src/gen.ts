import {
  type Page,
  type Test,
  type TestFunction,
  type GenType,
  type GenStepFunction,
  type PlaywrightTestFunction,
  ModelOptions,
  Gen2EPlaywriteCodeEvalFunc,
} from "./types";
import { generatePlaywrightExpr } from "./gen/pw";
import { PlainGenResultError, TestStepGenResultError } from "./errors";
import { getSnapshot } from "./snapshot";
import { StaticStore } from "./static/store/store";
import env from "./env";
import { info } from "./log";
import { FSStaticStore } from "./static/store/fs";
import { debug } from "./log";

const logGen2EStart = (message: string, task: string) => {
  if (env.LOG_STEP) {
    info(`${message}:
=================================================================
Task: "${task}"
=================================================================\n`);
  }
};

const logGen2EEnd = (message: string, expr: string) => {
  if (env.LOG_STEP) {
    info(`${message}:
=================================================================
Expression: ${expr}
=================================================================\n`);
  }
};

export const gen: GenType = async function (
  this: GenType,
  task: string,
  config: {
    page: Page;
    store?: StaticStore;
  },
  options?: ModelOptions,
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
  const isDebug = options?.debug ?? env.DEFAULT_DEBUG_MODE;
  const store = config.store;

  let expression = "";
  if (store && this.useStatic) {
    const staticStep = store?.fetchStatic(store.makeIdent("", task));
    if (staticStep) {
      logGen2EStart("found static expression for task", task);
      {
        expression = staticStep?.expression!;
      }
      logGen2EStart("static expression found", expression);
      return evalCode(`${expression}`, page);
    }
  }

  logGen2EStart("generating playwright expression with task", task);
  {
    const result = await generatePlaywrightExpr(
      {
        task,
        snapshot: await getSnapshot(page),
        options: options
          ? {
              model: options.model ?? env.DEFAULT_OPENAI_MODEL,
              debug: isDebug,
              openaiApiKey: options.openaiApiKey,
            }
          : undefined,
      },
      {
        onMessage: (message) => {
          if (isDebug) {
            debug(`[event] on message >>> ${JSON.stringify(message, null, 4)}`);
          }
        },
      }
    );

    if (result.type == "error") {
      throw new PlainGenResultError(result.errorMessage);
    }

    expression = result.result;
  }
  logGen2EEnd("evaluating expression via eval(...)", expression);

  if (store && this.useStatic) {
    const _static = {
      ident: store.makeIdent("", task),
      expression: expression,
    };
    debug("storing static", _static);
    store?.makeStatic(_static);
  }

  return evalCode(`${expression}`, page);
};

gen.test = function (
  this: GenType,
  testFunction: TestFunction,
  store: StaticStore = FSStaticStore
): PlaywrightTestFunction {
  return async ({ page, context, request }, testInfo): Promise<void> => {
    const { title } = testInfo;

    const gen: GenStepFunction = async (
      task: string,
      config: {
        page: Page;
        test: Test;
      },
      options?: ModelOptions,
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
      const isDebug = options?.debug ?? env.DEFAULT_DEBUG_MODE;

      const testIdent = store.makeIdent(title, task);
      if (store && this.useStatic) {
        let expression = "";
        const staticStep = store?.fetchStatic(testIdent);
        if (
          staticStep &&
          typeof staticStep.expression !== undefined &&
          staticStep.expression
        ) {
          logGen2EStart("found static expression for task", task);
          {
            expression = staticStep?.expression!;
          }
          logGen2EStart("static expression found", expression);
          return evalCode(`${expression}`, page);
        }
      }

      return test.step(task, async () => {
        let expression = "";

        logGen2EStart("generating playwright expression with task", task);
        {
          const result = await generatePlaywrightExpr(
            {
              task,
              snapshot: await getSnapshot(page),
              options: options
                ? {
                    model: options.model ?? env.DEFAULT_OPENAI_MODEL,
                    debug: isDebug,
                    openaiApiKey: options.openaiApiKey,
                  }
                : undefined,
            },
            {
              onMessage: (message) => {
                if (isDebug) {
                  debug(
                    `[event] on message >>> ${JSON.stringify(message, null, 4)}`
                  );
                }
              },
            }
          );

          if (result.type === "error") {
            test.fail();
            throw new TestStepGenResultError(result.errorMessage);
          }

          expression = result.result;
          if (this.useStatic) {
            const _static = {
              ident: testIdent,
              expression: expression,
            };
            store.makeStatic(_static);
          }
        }
        logGen2EEnd("evaluating expression via eval(...)", expression);

        const evalResult = await evalCode(`${expression}`, page);
        return evalResult
      });
    };

    try {
      const result = testFunction(
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

gen.useStatic = env.USE_STATIC_STORE;
