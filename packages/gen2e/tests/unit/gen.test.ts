import {
  StaticStore,
  Page,
  gen,
  StaticGenStep,
  Gen2EGenError,
} from "../../src";
import {
  createPlaywrightCodeGenAgent,
  generatePlaywrightCode,
} from "../../src/playwright-gen";
import { getSnapshot } from "../../src/snapshot";
import env from "../../src/env";
import { APIRequestContext, BrowserContext } from "@playwright/test";

jest.mock("../../src/snapshot", () => ({
  getSnapshot: jest
    .fn()
    .mockReturnValue({ dom: "<html><!-- mock dom --></html>" }),
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
  const codeSample =
    '(async () => {return async () => (await page.goto("https://example.com"));})';
  const mockPage = {
    url: () => "https://example.com"
  } as Page;
  const staticStore = {};
  const mockStaticStore: StaticStore = {
    makeIdent: jest.fn((title, task) => task),
    fetchStatic: (ident) => staticStore[ident],
    makeStatic: (ident: string, content: StaticGenStep): void => {
      staticStore[ident] = content.expression;
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("should create a Playwright code generation agent", async () => {
    const mockAgent = jest.fn();
    mockCreatePlaywrightCodeGenAgent.mockReturnValue(mockAgent);
    mockGeneratePlaywrightCode.mockResolvedValue({
      type: "success",
      result: codeSample,
    });

    await gen("task 1", { page: mockPage }, {}, { store: mockStaticStore });

    expect(mockCreatePlaywrightCodeGenAgent).toHaveBeenCalledWith(
      env.OPENAI_MODEL,
      expect.any(Object),
      {
        fmt: expect.any(Function),
        sinks: expect.any(Object),
        info: expect.any(Function),
        warn: expect.any(Function),
        debug: expect.any(Function),
        error: expect.any(Function),
      }
    );
  });

  test("should execute static code if available", async () => {
    const evalCode = jest.fn().mockResolvedValue(undefined);
    staticStore["task 1"] = codeSample;

    await gen(
      "task 1",
      { page: mockPage },
      {},
      { store: mockStaticStore },
      evalCode
    );

    expect(evalCode).toHaveBeenCalledWith(codeSample, mockPage);
    delete staticStore["task 1"];
  });

  test("should generate new code if static code is not available", async () => {
    mockGeneratePlaywrightCode.mockResolvedValue({
      type: "success",
      result: codeSample,
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
    expect(evalCode).toHaveBeenCalledWith(codeSample, mockPage);
  });

  test("should handle errors during code generation", async () => {
    const errorMessage = "An error occurred during code generation";
    mockGeneratePlaywrightCode.mockResolvedValue({
      type: "error",
      errorMessage,
    });

    await expect(
      gen("task 1", { page: mockPage }, {}, { store: mockStaticStore })
    ).rejects.toThrow(Gen2EGenError);
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
        // @ts-ignore
        { title: "gen test" }
      )
    ).rejects.toThrow(Error);
  });
});
