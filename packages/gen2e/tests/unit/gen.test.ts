import {
  StaticStore,
  Page,
  PlainGenResultError,
  TestStepGenResultError,
  gen,
} from "../../src";
import {
  createPlaywrightCodeGenAgent,
  generatePlaywrightCode,
} from "../../src/playwright-gen";
import { getSnapshot } from "../../src/snapshot";
import env from "../../src/env";
import {
  APIRequestContext,
  BrowserContext,
  PlaywrightTestArgs,
} from "@playwright/test";

jest.mock("../..src/snapshot", () => ({
  getSnapshot: jest.fn(),
}));

jest.mock("../../src/playwright-gen", () => ({
  createPlaywrightCodeGenAgent: jest.fn(),
  generatePlaywrightCode: jest.fn(),
}));

jest.mock("../../src/env", () => ({
  OPENAI_MODEL: "davinci",
  DEBUG_MODE: false,
  LOG_STEP: false,
  USE_STATIC_STORE: true,
}));

const mockCreatePlaywrightCodeGenAgent =
  createPlaywrightCodeGenAgent as jest.MockedFunction<
    typeof createPlaywrightCodeGenAgent
  >;
const mockGeneratePlaywrightCode =
  generatePlaywrightCode as jest.MockedFunction<typeof generatePlaywrightCode>;
const mockGetSnapshot = getSnapshot as jest.MockedFunction<typeof getSnapshot>;

describe("gen function", () => {
  const mockPage = {} as Page;
  const mockStaticStore: StaticStore = {
    makeIdent: jest.fn((title, task) => `mockIdent-${title}-${task}`),
    fetchStatic: jest.fn(),
    makeStatic: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("should create a Playwright code generation agent", async () => {
    const mockAgent = jest.fn();
    mockCreatePlaywrightCodeGenAgent.mockReturnValue(mockAgent);

    await gen("task 1", { page: mockPage }, {}, { store: mockStaticStore });

    expect(mockCreatePlaywrightCodeGenAgent).toHaveBeenCalledWith(
      env.OPENAI_MODEL,
      expect.any(Object)
    );
  });

  test("should execute static code if available", async () => {
    const staticExpression = 'await page.goto("https://example.com");';
    (
      mockStaticStore.fetchStatic as jest.MockedFunction<
        typeof mockStaticStore.fetchStatic
      >
    ).mockReturnValue({
      ident: "mockIdent-gen test-task 1",
      expression: staticExpression,
    });

    const evalCode = jest.fn().mockResolvedValue(undefined);

    await gen(
      "task 1",
      { page: mockPage },
      {},
      { store: mockStaticStore },
      evalCode
    );

    expect(evalCode).toHaveBeenCalledWith(staticExpression, mockPage);
  });

  test("should generate new code if static code is not available", async () => {
    const generatedExpression = 'await page.goto("https://example.com");';
    mockGeneratePlaywrightCode.mockResolvedValue({
      type: "success",
      result: generatedExpression,
    });
    mockGetSnapshot.mockResolvedValue({ dom: "<html></html>" });

    const evalCode = jest.fn().mockResolvedValue(undefined);

    await gen(
      "task 1",
      { page: mockPage },
      {},
      { store: mockStaticStore },
      evalCode
    );

    expect(mockGeneratePlaywrightCode).toHaveBeenCalledWith(expect.any(Object));
    expect(evalCode).toHaveBeenCalledWith(generatedExpression, mockPage);
  });

  test("should handle errors during code generation", async () => {
    const errorMessage = "An error occurred during code generation";
    mockGeneratePlaywrightCode.mockResolvedValue({
      type: "error",
      errorMessage,
    });

    await expect(
      gen("task 1", { page: mockPage }, {}, { store: mockStaticStore })
    ).rejects.toThrow(PlainGenResultError);
  });

  test("should handle errors during test step execution", async () => {
    const testFunction = jest.fn().mockImplementation(async ({ page, gen }) => {
      await gen("task 1", { page, test: expect.anything() });
    });

    mockGeneratePlaywrightCode.mockResolvedValue({
      type: "error",
      errorMessage: "Test step error",
    });

    const testWrapper = gen.test(testFunction, { store: mockStaticStore });

    await expect(
      testWrapper(
        {
          page: mockPage,
          context: {} as unknown as BrowserContext,
          request: {} as unknown as APIRequestContext,
        },
        { title: "gen test" } as unknown as PlaywrightTestArgs
      )
    ).rejects.toThrow(TestStepGenResultError);
  });
});
