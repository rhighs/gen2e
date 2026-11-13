import {
  type APIRequestContext,
  type BrowserContext,
  expect as nativeExpect,
} from "@playwright/test";
import {
  type Gen2EGenOptions,
  type Gen2ELLMCallHooks,
  type Gen2EPlaywriteCodeEvalFunc,
  type GenStepFunction,
  type GenType,
  gen as genObject,
  type Page,
  type PlaywrightTestFunction,
  type StaticStore,
  type TestFunction,
  type TestInfo,
} from "@rhighs/gen2e";
import { type Gen2ELogger, makeLogger } from "@rhighs/gen2e-logger";
import { gen2eSanitize } from "../ast/gen2e-sanitize";
import env from "../env";
import { Gen2ESandboxError } from "../errors";

export const sandboxEval = async (
  gen2eTestSource: string,
  page: Page,
  store: StaticStore,
  llmCallHooks?: Gen2ELLMCallHooks,
  modelOptions?: Gen2EGenOptions,
  evalPwCode: Gen2EPlaywriteCodeEvalFunc = (code: string, page: Page) =>
    new Function("code", "page", "return Promise.resolve()")(code, page),
  gen: GenType = genObject,
  _logger?: Gen2ELogger,
): Promise<any> => {
  const logger = makeLogger("GEN2E-INTEPRETER-SANDBOX");
  if (_logger) {
    logger.config(_logger);
  }

  const _gen_custom_eval =
    (__gen: GenStepFunction) =>
    async (...args: Parameters<GenStepFunction>): ReturnType<GenStepFunction> => {
      const [task, config, _options, _] = args;
      if (env.SANDBOX_DEBUG) {
        logger.debug("calling __gen() with args", args);
      }

      return __gen(task, config, modelOptions, evalPwCode);
    };

  const _gen_test = (testFunction: TestFunction): PlaywrightTestFunction =>
    gen.test(
      async ({ page, gen, ...rest }, testInfo) => {
        if (env.SANDBOX_DEBUG) {
          logger.debug("using gen function source code:\n", gen.toString());
        }

        return await testFunction(
          {
            page,
            gen: _gen_custom_eval(gen),
            context: rest.context,
            request: rest.request,
          },
          testInfo,
        );
      },
      { store, hooks: llmCallHooks, logger },
    );

  const _test = async (testTitle: string, testFunction: PlaywrightTestFunction): Promise<any> => {
    return testFunction(
      {
        page,
        context: {} as BrowserContext,
        request: {} as APIRequestContext,
      },
      {
        title: testTitle,
      } as TestInfo,
    );
  };

  _test.step = async (stepTitle: string, step: (...args: any[]) => Promise<any> | any) => {
    if (env.SANDBOX_DEBUG) {
      logger.debug('calling test step for task: "', stepTitle, '"');
    }
    await step();
  };

  function _expect_custom_call(...args: any[]) {
    const [head, ...tail] = args;
    return nativeExpect(head, ...tail);
  }

  _test.fail = (...args: any[]) => {
    const message = "test.fail has been called...";
    logger.error(message, ...args);
    throw new Gen2ESandboxError(message);
  };

  if (env.SANDBOX_DEBUG) {
    logger.debug("gen2e source code before sanitize step:\n", gen2eTestSource);
  }

  // Only gen calls matter when recording; expect(...) cannot run outside a test, so sanitize strips every other call.
  const s = gen2eSanitize(gen2eTestSource);
  if (env.SANDBOX_DEBUG) {
    logger.debug("gen2e source code after sanitize step:\n", s);
  }

  const functionSource = (body: string) => `return ${body.trimStart()}`;
  const exeMe = new Function("gen", "test", "expect", functionSource(s));
  return await exeMe({ test: _gen_test }, _test, _expect_custom_call);
};
