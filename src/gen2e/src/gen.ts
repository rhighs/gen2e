import {
  type Page,
  type Test,
  type TestFunction,
  type GenType,
  type GenStepFunction,
  type PlaywrightTestFunction,
  StepOptions,
} from "./types";
import { generatePlaywrightExpr } from "./gen/playwright";
import { PlainGenResultError, TestStepGenResultError } from "./errors";
import { getSnapshot } from "./snapshot";
import { fetchStatic, makeStatic } from "./static-store";
import { DEFAULT_MODEL, DEBUG_MODE } from "./constants";

export const gen: GenType = async (
  task: string,
  config: { page: Page },
  options?: StepOptions
): Promise<any> => {
  if (!config || !config.page) {
    throw Error(
      "The gen() function is missing the required `{ page }` argument."
    );
  }
  const page = config.page;
  const debug = options?.debug ?? DEBUG_MODE;

  const result = await generatePlaywrightExpr(
    page,
    {
      task,
      snapshot: await getSnapshot(page),
      options: options
        ? {
            model: options.model ?? DEFAULT_MODEL,
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

  return eval(`${result.result}()`);
};

gen.test = (testFunction: TestFunction): PlaywrightTestFunction => {
  return async ({ page, context, request }, testInfo): Promise<void> => {
    const { title } = testInfo;

    const gen: GenStepFunction = async (
      task: string,
      config: { page: Page; test: Test },
      options?: StepOptions
    ): Promise<any> => {
      if (!config || !config.page) {
        throw Error(
          "The gen() function is missing the required `{ page }` argument."
        );
      }
      const { test, page } = config;
      const debug = options?.debug ?? DEBUG_MODE;

      const testIdent = `gen2e - [${title}](${task})`;
      const maybeStatic = fetchStatic(testIdent);
      if (maybeStatic?.expression) {
        return eval(`${maybeStatic.expression}()`);
      }

      return test.step(testIdent, async () => {
        const result = await generatePlaywrightExpr(
          page,
          {
            task,
            snapshot: await getSnapshot(page),
            options: options
              ? {
                  model: options.model ?? DEFAULT_MODEL,
                  debug: options.debug ?? DEBUG_MODE,
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

        const expression = result.result;
        makeStatic({
          ident: testIdent,
          expression: expression,
        });

        return eval(`${expression}()`);
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