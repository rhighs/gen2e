import {
  Page,
  StaticStore,
  GenType,
  TestFunction,
  PlaywrightTestFunction,
} from "@rhighs/gen2e";
import { sandboxEval, gen2eSanitize } from "../../../src";

jest.mock("../../../src/ast/gen2e-sanitize", () => ({
  gen2eSanitize: jest.fn().mockImplementation((source) => source),
}));

jest.mock("../../../src/env", () => ({
  SANDBOX_DEBUG: false,
}));

describe("sandboxEval", () => {
  const mockNoop = "(() => { return Promise.resolve() })";
  const mockGen = {
    test:
      (testFunction: TestFunction): PlaywrightTestFunction =>
      ({ page, context, request }, testInfo) =>
        testFunction(
          {
            page,
            gen: async (task, config, options, evalCode) => {
              const ident = staticStore.makeIdent(testInfo.title, task);
              const staticCode = staticStore.fetchStatic(ident);
              if (staticCode && staticCode.expression) {
                console.debug(staticCode);
                return evalCode!(staticCode.expression, page);
              }

              return await config.test.step("task", async () => {
                const expression = `async () => {return ${mockNoop}}`;
                staticStore.makeStatic(ident, { expression });
                return evalCode!(expression, page);
              });
            },
            context,
            request,
          },
          testInfo
        ),
  } as GenType;

  const mockPage = {} as Page;
  const inMemoryStatic: { [key: string]: string } = {};
  const staticStore: StaticStore = {
    makeIdent: (title, task) => `gen2.interpreter - [${title}](${task})`,
    fetchStatic: (ident: string) => ({
      ident,
      expression: inMemoryStatic[ident],
    }),
    makeStatic: (ident, content) => {
      inMemoryStatic[ident] = content.expression;
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    for (const key in inMemoryStatic) {
      delete inMemoryStatic[key];
    }
  });

  test("should execute sanitized gen2e test source code with static code from the store", async () => {
    const gen2eTestSource = `
    test('gen test',
      gen.test(async ({ page, gen }) => {
        await gen('task 1', { page, test });
      })
    );
    `;

    const ident = staticStore.makeIdent("gen test", "task 1");
    const staticExpression =
      "(async () => { await page.goto('https://example.com'); })";
    staticStore.makeStatic(ident, { expression: staticExpression });
    const customEvalPwCode = jest.fn().mockResolvedValue(Promise.resolve());

    await sandboxEval(
      gen2eTestSource,
      mockPage,
      staticStore,
      undefined,
      undefined,
      customEvalPwCode,
      mockGen
    );

    expect(gen2eSanitize).toHaveBeenCalledWith(gen2eTestSource);
    expect(inMemoryStatic[ident]).toBe(staticExpression);
  });

  /* FIXME:
   rob: cannot be tested under jest runtime, eval and new Function dynamic evals seem to be disabled
        always leading to a noop.
   test("should handle evaluation errors gracefully", async () => {
     const gen2eTestSource = `
     test('gen test',
       gen.test(async ({ page, gen }) => {
         throw new Error('Test error');
       })
     );
     `;
  
     const customEvalPwCode = jest.fn().mockResolvedValue(Promise.resolve());
     const promise = sandboxEval(
       gen2eTestSource,
       mockPage,
       staticStore,
       undefined,
       undefined,
       customEvalPwCode,
       mockGen
     );
  
     expect(gen2eSanitize).toHaveBeenCalledWith(gen2eTestSource);
     expect(promise).rejects.toThrow("Test error");
   });
  */

  /* FIXME:
   rob: cannot be tested under jest runtime, eval and new Function dynamic evals seem to be disabled
        always leading to a noop.
   test("should use provided evalPwCode function", async () => {
     const gen2eTestSource = `
     test('gen test',
       gen.test(async ({ page, gen }) => {
         await gen('task 1', { page, test });
       })
     );
     `;

     const ident = staticStore.makeIdent("gen test", "task 1");
     const staticExpression = "(async () => { await page.goto('https://example.com'); })";
     staticStore.makeStatic({ ident, expression: staticExpression });
  
     const customEvalPwCode = jest.fn().mockResolvedValue(Promise.resolve());
     await sandboxEval(
       gen2eTestSource,
       mockPage,
       staticStore,
       undefined,
       undefined,
       customEvalPwCode,
       mockGen
     );
  
     expect(customEvalPwCode).toHaveBeenCalledWith(staticExpression, mockPage);
  });
  */

  test("should handle empty gen2eTestSource", async () => {
    await sandboxEval(
      "",
      mockPage,
      staticStore,
      undefined,
      undefined,
      undefined,
      mockGen
    );
    expect(gen2eSanitize).toHaveBeenCalledWith("");
  });
});
