import { APIRequestContext, BrowserContext } from "@playwright/test";
import {
  Gen2EPlaywriteCodeEvalFunc,
  GenFunction,
  gen as genObject,
  GenStepFunction,
  Page,
  PlaywrightTestFunction,
  TestFunction,
  TestInfo,
} from "@rhighs/gen2e";
import { Gen2ESandboxError } from "./errors";
import { StaticStore } from "@rhighs/gen2e/src/static/store/store";
import { debug, err } from "./log";
import { expect as nativeExpect } from "@playwright/test";
import { compile as sanitizeGen2e } from "./ast/gen2e-sanitize";

const SANDBOX_DEBUG = !!process.env.GEN2E_SANDBOX_DEBUG;

/**
 * rob:
 *      here are a few interpreter shenanigans to allow for execution of gen2e
 *      test syntax in a sandboxed environment. This is particularly
 *      useful to test out the correct behavior of the gen2e library,
 *      but most importantly to recored changes to a static store as it's being
 *      used in a playwright context.
 */

/**
 * Executes a given E2E test source code in a sandboxed environment.
 * This function is primarily designed to allow injection of a static store
 * to record generated code into a fake test.
 *
 * @param {string} gen2eTestSource - The E2E test source code to execute.
 * @param {Page} page - The Playwright Page object used for browser interactions.
 * @param {StaticStore} store - The static store to record generated code.
 * @param {Gen2EPlaywriteCodeEvalFunc} evalPwCode - function that is going to be used to evaluate pw code
 * @returns {Promise<void>} - A promise that resolves when the test execution is complete.
 */
export const sandboxEval = async (
  gen2eTestSource: string,
  page: Page,
  store: StaticStore,
  evalPwCode: Gen2EPlaywriteCodeEvalFunc = (code: string, page: Page) =>
    new Function("code", "page", "return Promise.resolve()")(code, page)
) => {
  const _gen_custom_eval =
    (__gen: GenStepFunction) =>
    async (
      ...args: Parameters<GenStepFunction>
    ): ReturnType<GenStepFunction> => {
      const [task, config, options, _] = args;
      if (SANDBOX_DEBUG) {
        debug("calling __gen() with args", args);
      }

      return __gen(task, config, options, evalPwCode);
    };

  const _gen_test = (testFunction: TestFunction) =>
    genObject.test(async ({ page, gen, ...rest }, testInfo) => {
      if (SANDBOX_DEBUG) {
        debug("using gen function source code:\n", gen.toString());
      }

      return await testFunction(
        {
          page,
          gen: _gen_custom_eval(gen),
          context: rest.context,
          request: rest.request,
        },
        testInfo
      );
    }, store);

  const _test = async (
    testTitle: string,
    testFunction: PlaywrightTestFunction
  ): Promise<void> => {
    await testFunction(
      {
        page,
        context: {} as BrowserContext,
        request: {} as APIRequestContext,
      },
      {
        title: testTitle,
      } as TestInfo
    );
  };

  _test.step = async (
    stepTitle,
    step: (...args: any[]) => Promise<any> | any
  ) => {
    if (SANDBOX_DEBUG) {
      debug('calling test step for task: "', stepTitle, '"');
    }
    await step();
  };

  function _expect_custom_call(...args: any[]) {
    const [head, ...tail] = args;
    return nativeExpect(head, ...tail);
  }

  _test.fail = (...args: any[]) => {
    const message = "test.fail has been called...";
    err(message, ...args);
    throw new Gen2ESandboxError(message);
  };

  if (SANDBOX_DEBUG) {
    debug("gen2e source code before sanitize step:\n", gen2eTestSource);
  }

  // rob: since we're sandboxing gen execution to capture generated static code;
  //      all calls that are not calls to the gen function can be stripped away.
  //      This is primarily done to eliminate calls to expect(...) as it is not
  //      supported outside of a test environment, and mocking it would be too
  //      much of a burden to carry on, I just assume they're correct. I do not expect
  //      the LLM to be so dumb to mess the signature up after I've fed it an entire
  //      cheatsheet on how that is used.
  const s = sanitizeGen2e(gen2eTestSource);
  if (SANDBOX_DEBUG) {
    debug("gen2e source code after sanitize step:\n", s);
  }

  const functionSource = (body: string) => `return ${body}`;
  const exeMe = new Function("gen", "test", "expect", functionSource(s));
  return await exeMe({ test: _gen_test }, _test, _expect_custom_call);
};
