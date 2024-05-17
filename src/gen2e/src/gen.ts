import {
  type Page,
  type Test,
  type TestFunction,
  type GenType,
  type GenStepFunction,
  type PlaywrightTestFunction,
  StepOptions,
} from "./types";
import { generatePlaywrightExpr } from "./gen/pw";
import { PlainGenResultError, TestStepGenResultError } from "./errors";
import { getSnapshot } from "./snapshot";
import { StaticStore } from "./static/store/store";
import consts from "./constants";
import { info } from "./log";
import { FSStaticStore } from "./static/store/fs";

const logStart = (message: string, task: string) => {
  if (consts.GEN_STEP_LOG) {
    info(`${message}:
=================================================================
Task: "${task}"
=================================================================\n`);
  }
};

const logEnd = (message: string, expr: string) => {
  if (consts.GEN_STEP_LOG) {
    info(`${message}:
=================================================================
Expression: ${expr}
=================================================================\n`);
  }
};

export const gen: GenType = async (
  task: string,
  config: {
    page: Page;
    // TODO: use this store for standalone gen calls (e.g. non-testing browser
    //       instances, automations of some kind and so on...)
    store?: StaticStore;
  },
  options?: StepOptions,
  evalCode: (x: string, p: Page) => Function = (code: string, page: Page) =>
    new Function("page", "return " + code)(page)
): Promise<any> => {
  if (!config || !config.page) {
    throw Error(
      "The gen() function is missing the required `{ page }` argument."
    );
  }
  const page = config.page;
  const debug = options?.debug ?? consts.DEBUG_MODE;
  const store = config.store;

  let expression = "";
  if (config.store) {
    const staticStep = store?.fetchStatic(store.makeIdent("", task));
    if (staticStep) {
      logStart("found static expression for task", task);
      {
        expression = staticStep?.expression!;
      }
      logStart("static expression found", expression);
      return evalCode(`${expression}()`, page);
    }
  }

  logStart("generating playwright expression with task", task);
  {
    const result = await generatePlaywrightExpr(
      page,
      {
        task,
        snapshot: await getSnapshot(page),
        options: options
          ? {
              model: options.model ?? consts.DEFAULT_MODEL,
              debug,
              openaiApiKey: options.openaiApiKey,
            }
          : undefined,
      },
      (message) => {
        if (debug) {
          console.debug(
            `[event] on message >>> ${JSON.stringify(message, null, 4)}`
          );
        }
      }
    );

    if (result.type == "error") {
      throw new PlainGenResultError(result.errorMessage);
    }

    expression = result.result;
  }
  logEnd("evaluating expression via eval(...)", expression);

  return evalCode(`${expression}()`, page);
};

gen.test = (
  testFunction: TestFunction,
  store: StaticStore = FSStaticStore
): PlaywrightTestFunction => {
  return async ({ page, context, request }, testInfo): Promise<void> => {
    const { title } = testInfo;

    const gen: GenStepFunction = async (
      task: string,
      config: {
        page: Page;
        test: Test;
      },
      options?: StepOptions,
      evalCode: (x: string, p: Page) => Function = (code: string, page: Page) =>
        new Function("page", "return " + code)(page)
    ): Promise<any> => {
      if (!config || !config.page) {
        throw Error(
          "The gen() function is missing the required `{ page }` argument."
        );
      }
      const { test, page } = config;
      const debug = options?.debug ?? consts.DEBUG_MODE;

      const testIdent = store.makeIdent(title, task);
      if (store) {
        let expression = "";
        const staticStep = store?.fetchStatic(testIdent);
        if (
          staticStep &&
          typeof staticStep.expression !== undefined &&
          staticStep.expression
        ) {
          logStart("found static expression for task", task);
          {
            expression = staticStep?.expression!;
          }
          logStart("static expression found", expression);
          return evalCode(`${expression}()`, page);
        }
      }

      return test.step(task, async () => {
        let expression = "";

        logStart("generating playwright expression with task", task);
        {
          const result = await generatePlaywrightExpr(
            page,
            {
              task,
              snapshot: await getSnapshot(page),
              options: options
                ? {
                    model: options.model ?? consts.DEFAULT_MODEL,
                    debug,
                    openaiApiKey: options.openaiApiKey,
                  }
                : undefined,
            },
            (message) => {
              if (debug) {
                console.debug(
                  `[event] on message >>> ${JSON.stringify(message, null, 4)}`
                );
              }
            }
          );

          if (result.type === "error") {
            test.fail();
            throw new TestStepGenResultError(result.errorMessage);
          }

          expression = result.result;
          store.makeStatic({
            ident: testIdent,
            expression: expression,
          });
        }
        logEnd("evaluating expression via eval(...)", expression);

        return evalCode(`${expression}()`, page);
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
