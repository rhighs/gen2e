import { MAX_TASK_CHARS } from "./config";
import {
  type Page,
  type Test,
  type TestFunction,
  type GenType,
  type GenStepFunction,
  type PlaywrightTestFunction,
  StepOptions,
  TaskResult,
} from "./types";
import { generateCode } from "./gen-call";
import { UnimplementedError } from "./errors";
import { getSnapshot } from "./snapshot";
import { fetchStatic, makeStatic } from "./static";

const unrwrapResult = (result: TaskResult) => {
  if (result.type === "error") {
    throw new UnimplementedError(result.errorMessage);
  } else {
    return result.code;
  }
};

export const gen: GenType = async (
  task: string,
  config: { page: Page; test?: Test },
  options?: StepOptions
): Promise<any> => {
  if (!config || !config.page) {
    throw Error(
      "The gen() function is missing the required `{ page }` argument."
    );
  }

  const _ = async () => unrwrapResult(await runTask(task, page, options));
  return test ? test.step(`gen-playwright.ai '${task}'`, _) : _();
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

      const testIdent = `gen2e - [${title}](${task})`;
      const maybeStatic = fetchStatic(testIdent);
      if (maybeStatic?.expression) {
        return eval(`${maybeStatic.expression}()`);
      }

      return test.step(testIdent, async () => {
        const result = unrwrapResult(
          await generateCode(
            page,
            {
              task,
              snapshot: await getSnapshot(page),
              options: options
                ? {
                    model: options.model ?? "gpt-4-1106-preview",
                    debug: options.debug ?? false,
                    openaiApiKey: options.openaiApiKey,
                  }
                : undefined,
            },
            (message) =>
              console.debug(`message >>> ${JSON.stringify(message, null, 4)}`)
          )
        );

        makeStatic({
          ident: testIdent,
          expression: result,
        });

        console.info(">>>", result);
        return eval(`${result}()`);
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

const runTask = async (
  task: string,
  page: Page,
  options: StepOptions | undefined
) =>
  task.length > MAX_TASK_CHARS
    ? Promise.reject(
        `Provided task string is too long, max length is ${MAX_TASK_CHARS} chars.`
      )
    : await generateCode(page, {
        task,
        snapshot: await getSnapshot(page),
        options: options
          ? {
              model: options.model ?? "gpt-4-1106-preview",
              debug: options.debug ?? false,
              openaiApiKey: options.openaiApiKey,
            }
          : undefined,
      });
