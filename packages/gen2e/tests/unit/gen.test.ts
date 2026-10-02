import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { APIRequestContext, BrowserContext } from "@playwright/test";
import {
  FSStaticStore,
  Gen2EGenError,
  gen,
  type Page,
  type StaticGenStep,
  type StaticStore,
} from "../../src";
import env from "../../src/env";
import { createPlaywrightCodeGenAgent, generatePlaywrightCode } from "../../src/playwright-gen";
import { getSnapshot } from "../../src/snapshot";
import { wrapIdent } from "../../src/static/ident";

jest.mock("../../src/snapshot", () => ({
  getSnapshot: jest.fn().mockReturnValue({ dom: "<html><!-- mock dom --></html>" }),
}));

jest.mock("../../src/playwright-gen", () => ({
  createPlaywrightCodeGenAgent: jest.fn(),
  generatePlaywrightCode: jest.fn(),
  GEN2E_PROMPT_VERSION: "test-prompt-version",
}));

jest.mock("../../src/env", () => ({
  OPENAI_MODEL: "davinci",
  DEBUG_MODE: false,
  LOG_STEP: false,
  USE_STATIC_STORE: true,
  REPLAY_ONLY: false,
}));

const mockCreatePlaywrightCodeGenAgent = createPlaywrightCodeGenAgent as jest.MockedFunction<
  typeof createPlaywrightCodeGenAgent
>;
const mockGeneratePlaywrightCode = generatePlaywrightCode as jest.MockedFunction<
  typeof generatePlaywrightCode
>;
const mockGetSnapshot = getSnapshot as jest.MockedFunction<typeof getSnapshot>;

describe("gen function", () => {
  const codeSample = '(async () => {return async () => (await page.goto("https://example.com"));})';
  const mockPage = {
    url: () => "https://example.com",
  } as Page;
  const staticStore = {};
  const mockStaticStore: StaticStore = {
    makeIdent: jest.fn((_title, task) => task),
    fetchStatic: (ident) => staticStore[ident],
    makeStatic: (ident: string, content: StaticGenStep): void => {
      staticStore[ident] = content.expression;
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    gen.useStatic = true;
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
      expect.objectContaining({ promptVersion: "test-prompt-version" }),
      {
        fmt: expect.any(Function),
        sinks: expect.any(Object),
        info: expect.any(Function),
        warn: expect.any(Function),
        debug: expect.any(Function),
        error: expect.any(Function),
      },
    );
  });

  test("should execute static code if available", async () => {
    const evalCode = jest.fn().mockResolvedValue(undefined);
    staticStore["task 1"] = codeSample;

    await gen("task 1", { page: mockPage }, {}, { store: mockStaticStore }, evalCode);

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

    await gen("task 1", { page: mockPage }, {}, { store: mockStaticStore }, evalCode);

    expect(mockGeneratePlaywrightCode).toHaveBeenCalledWith(expect.any(Object));
    expect(evalCode).toHaveBeenCalledWith(codeSample, mockPage);
  });

  test("should handle errors during code generation", async () => {
    const errorMessage = "An error occurred during code generation";
    mockGeneratePlaywrightCode.mockResolvedValue({
      type: "error",
      errorMessage,
    });

    await expect(gen("task 1", { page: mockPage }, {}, { store: mockStaticStore })).rejects.toThrow(
      Gen2EGenError,
    );
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
        // @ts-expect-error
        { title: "gen test" },
      ),
    ).rejects.toThrow(Error);
  });

  test("should persist saved context refs and meta in a single write", async () => {
    const basePath = mkdtempSync(path.join(tmpdir(), "gen2e-save-context-"));
    const originalStaticPath = process.env.GEN2E_STATIC_PATH;
    process.env.GEN2E_STATIC_PATH = basePath;

    try {
      mockGeneratePlaywrightCode.mockResolvedValue({
        type: "success",
        result: codeSample,
      });
      mockGetSnapshot.mockResolvedValue({
        dom: "<html><body>rendered</body></html>",
        screenshot: Buffer.from("fake-image"),
      });

      const persisted: StaticGenStep[] = [];
      const store: StaticStore = {
        makeIdent: (_title, task) => task,
        fetchStatic: () => undefined,
        makeStatic: (_ident, content) => persisted.push(content),
      };
      const evalCode = jest.fn().mockResolvedValue(undefined);

      await gen(
        "save context task",
        { page: mockPage },
        { saveContext: true },
        { store },
        evalCode,
      );

      expect(persisted).toHaveLength(1);
      const saved = persisted[0];
      expect(saved.context?.refs?.pageUrl).toBe("https://example.com");

      const ident = wrapIdent("save context task");
      const htmlPath = saved.context?.refs?.htmlPath;
      const screenshotPath = saved.context?.refs?.screenshotPath;
      expect(htmlPath).toBe(path.join(basePath, "data", `${ident}.gen.html`));
      expect(screenshotPath).toBe(path.join(basePath, "data", `${ident}.gen.jpg`));
      expect(existsSync(htmlPath as string)).toBe(true);
      expect(existsSync(screenshotPath as string)).toBe(true);

      expect(saved.meta?.model).toBe(env.OPENAI_MODEL);
      expect(saved.meta?.promptVersion).toBe("test-prompt-version");
      expect(saved.meta?.pageUrl).toBe("https://example.com");
      expect(saved.meta?.generatedAt).toEqual(expect.any(String));
      expect(saved.meta?.domFingerprint).toBe(wrapIdent("<html><body>rendered</body></html>"));
    } finally {
      if (originalStaticPath === undefined) {
        delete process.env.GEN2E_STATIC_PATH;
      } else {
        process.env.GEN2E_STATIC_PATH = originalStaticPath;
      }
      rmSync(basePath, { recursive: true, force: true });
    }
  });

  test("should disable the store when explicitly null", async () => {
    mockGeneratePlaywrightCode.mockResolvedValue({
      type: "success",
      result: codeSample,
    });
    mockGetSnapshot.mockResolvedValue({ dom: "<html></html>" });

    const fetchSpy = jest.spyOn(FSStaticStore, "fetchStatic");
    const makeSpy = jest.spyOn(FSStaticStore, "makeStatic");
    const evalCode = jest.fn().mockResolvedValue(undefined);

    await gen("task 1", { page: mockPage }, {}, { store: null }, evalCode);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(makeSpy).not.toHaveBeenCalled();
    expect(evalCode).toHaveBeenCalledWith(codeSample, mockPage);

    fetchSpy.mockRestore();
    makeSpy.mockRestore();
  });
});
