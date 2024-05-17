import { APIRequestContext, BrowserContext } from "@playwright/test";
import gen, {
  GenStepFunction,
  Page,
  PlaywrightTestFunction,
  TestFunction,
  TestInfo,
} from "@righs/gen2e";
import { compile as sanitizeGen2e } from "@righs/gen2e/src/ast-utils/gen2e-sanitize";
import { StaticStore } from "@righs/gen2e/src/static/store/store";
import { debug } from "./log";

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
 * @returns {Promise<void>} - A promise that resolves when the test execution is complete.
 */
export const sandboxEval = async (
  gen2eTestSource: string,
  page: Page,
  store: StaticStore,
  evalCode: (source: string) => Function = (_: string) =>
    new Function("return Promise.resolve()")
) => {
  const _gen_noop =
    (__gen: GenStepFunction) =>
    async (
      ...args: Parameters<GenStepFunction>
    ): ReturnType<GenStepFunction> => {
      const [task, config, options, _] = args;
      if (SANDBOX_DEBUG) {
        debug("calling __gen() with args", args);
      }

      return await __gen(task, config, options, evalCode);
    };

  const _gen_test = (testFunction: TestFunction) =>
    gen.test(async ({ page, gen, ...rest }, testInfo) => {
      if (SANDBOX_DEBUG) {
        debug("using gen function source code:\n", gen.toString());
      }

      return await testFunction(
        {
          page,
          gen: _gen_noop(gen),
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
      debug('calling test step with for task: "', stepTitle, '"');
    }
    await step();
  };

  if (SANDBOX_DEBUG) {
    debug("gen2e source code before sanitize step:\n", gen2eTestSource)
  }
  // rob: since we're sandboxing gen execution to capture generated static code;
  //      all calls that are not calls to the gen function can be stripped away.
  const s = sanitizeGen2e(gen2eTestSource);
  if (SANDBOX_DEBUG) {
    debug("gen2e source code after sanitize step:\n", s)
  }
  await new Function("gen", "test", `return ${s};`)(
    { test: _gen_test },
    _test
  );
};
