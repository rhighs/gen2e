import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { APIRequestContext, BrowserContext } from "@playwright/test";
import {
  FSStaticStore,
  Gen2EGenError,
  Gen2EStaleCacheError,
  gen,
  type Page,
  type StaticGenStep,
  type StaticStore,
  type Test,
} from "../../src";
import env from "../../src/env";
import { createPlaywrightCodeGenAgent, generatePlaywrightCode } from "../../src/playwright-gen";
import { getDomRevision, getSnapshot } from "../../src/snapshot";
import { wrapIdent } from "../../src/static/ident";

jest.mock("../../src/snapshot", () => ({
  getSnapshot: jest.fn().mockReturnValue({ dom: "<html><!-- mock dom --></html>" }),
  getDomRevision: jest.fn().mockReturnValue({ navigations: 0, mutations: 0 }),
  installDomRevisionTracker: jest.fn(),
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
  STALE_CACHE: "regen",
  CHEAP_MODEL: "",
}));

// The config file disables the ladder by default; individual tests opt in
// through the `ladder` option or `env.CHEAP_MODEL`.
jest.mock("../../src/config", () => ({
  __esModule: true,
  default: { ladder: false },
}));

const mockCreatePlaywrightCodeGenAgent = createPlaywrightCodeGenAgent as jest.MockedFunction<
  typeof createPlaywrightCodeGenAgent
>;
const mockGeneratePlaywrightCode = generatePlaywrightCode as jest.MockedFunction<
  typeof generatePlaywrightCode
>;
const mockGetSnapshot = getSnapshot as jest.MockedFunction<typeof getSnapshot>;
const mockGetDomRevision = getDomRevision as jest.MockedFunction<typeof getDomRevision>;

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
    mockGetSnapshot.mockReset();
    mockGetSnapshot.mockResolvedValue({ dom: "<html></html>" });
    mockGetDomRevision.mockReset();
    mockGetDomRevision.mockResolvedValue({ navigations: 0, mutations: 0 });
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

  test("rethrows library errors unwrapped from gen.test", async () => {
    const testStep = {
      step: (_title: string, fn: () => Promise<unknown>) => fn(),
    } as unknown as Test;
    const testFunction = jest.fn().mockImplementation(async ({ page, gen: genStep }) => {
      await genStep("stale task", { page, test: testStep }, {}, () =>
        Promise.reject(new Error("expect(received).toBe(expected)")),
      );
    });
    const store: StaticStore = {
      makeIdent: (_title, task) => `ident-${task}`,
      fetchStatic: () => ({ expression: "cached()" }),
      makeStatic: jest.fn(),
    };

    const testWrapper = gen.test(testFunction, { store });

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
    ).rejects.toBeInstanceOf(Gen2EStaleCacheError);
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

  describe("snapshot capture reuse", () => {
    test("captures once when generation fails and is retried", async () => {
      mockGeneratePlaywrightCode
        .mockResolvedValueOnce({ type: "error", errorMessage: "generation failed" })
        .mockResolvedValueOnce({ type: "success", result: codeSample });
      const evalCode = jest.fn().mockResolvedValue(undefined);

      await gen(
        "capture reuse on generation error",
        { page: mockPage },
        { policies: { maxRetries: 2 } },
        { store: mockStaticStore },
        evalCode,
      );

      expect(mockGetSnapshot).toHaveBeenCalledTimes(1);
      expect(mockGetDomRevision).toHaveBeenCalledTimes(1);
      expect(mockGeneratePlaywrightCode).toHaveBeenCalledTimes(2);
    });

    test("re-captures after an eval failure moved the dom", async () => {
      mockGetSnapshot
        .mockResolvedValueOnce({ dom: "<html>first</html>" })
        .mockResolvedValueOnce({ dom: "<html>second</html>" });
      mockGetDomRevision
        .mockResolvedValueOnce({ navigations: 0, mutations: 0 })
        .mockResolvedValueOnce({ navigations: 1, mutations: 0 });
      mockGeneratePlaywrightCode.mockResolvedValue({ type: "success", result: codeSample });
      const evalCode = jest
        .fn()
        .mockRejectedValueOnce(new Error("boom"))
        .mockResolvedValueOnce("done");

      const result = await gen(
        "capture recapture on eval failure",
        { page: mockPage },
        { policies: { maxRetries: 2 } },
        { store: mockStaticStore },
        evalCode,
      );

      expect(result).toBe("done");
      expect(mockGetSnapshot).toHaveBeenCalledTimes(2);
      // one revision read per capture plus the post-failure comparison
      expect(mockGetDomRevision).toHaveBeenCalledTimes(3);
    });

    test("reuses the capture when the dom did not move after an eval failure", async () => {
      mockGetSnapshot.mockResolvedValue({ dom: "<html>stable</html>" });
      mockGetDomRevision.mockResolvedValue({ navigations: 0, mutations: 0 });
      mockGeneratePlaywrightCode.mockResolvedValue({ type: "success", result: codeSample });
      const evalCode = jest
        .fn()
        .mockRejectedValueOnce(new Error("boom"))
        .mockResolvedValueOnce("done");

      await gen(
        "capture reuse unchanged revision",
        { page: mockPage },
        { policies: { maxRetries: 2 } },
        { store: mockStaticStore },
        evalCode,
      );

      expect(mockGetSnapshot).toHaveBeenCalledTimes(1);
      expect(mockGetDomRevision).toHaveBeenCalledTimes(2);
    });

    test("re-captures when the screenshot policy escalates and the capture has no image", async () => {
      mockGetSnapshot
        .mockResolvedValueOnce({ dom: "<html>no image</html>" })
        .mockResolvedValueOnce({
          dom: "<html>with image</html>",
          screenshot: Buffer.from("image"),
        });
      mockGetDomRevision.mockResolvedValue({ navigations: 0, mutations: 0 });
      mockGeneratePlaywrightCode.mockResolvedValue({ type: "success", result: codeSample });
      const evalCode = jest
        .fn()
        .mockRejectedValueOnce(new Error("boom"))
        .mockResolvedValueOnce("done");

      await gen(
        "capture escalation",
        { page: mockPage },
        { model: "gpt-4o-mini", policies: { screenshot: "onfail", maxRetries: 2 } },
        { store: mockStaticStore },
        evalCode,
      );

      expect(mockGetSnapshot).toHaveBeenCalledTimes(2);
      expect(mockGetSnapshot.mock.calls[1][2]).toEqual(
        expect.objectContaining({ screenshot: true }),
      );
    });

    test("reads the revision before a screenshot-free capture", async () => {
      mockGetSnapshot.mockResolvedValue({ dom: "<html>plain</html>" });
      mockGetDomRevision.mockResolvedValue({ navigations: 0, mutations: 0 });
      mockGeneratePlaywrightCode.mockResolvedValue({ type: "success", result: codeSample });
      const evalCode = jest.fn().mockResolvedValue("done");

      await gen(
        "pre capture revision",
        { page: mockPage },
        { policies: { screenshot: "off" } },
        { store: mockStaticStore },
        evalCode,
      );

      expect(mockGetDomRevision.mock.invocationCallOrder[0]).toBeLessThan(
        mockGetSnapshot.mock.invocationCallOrder[0],
      );
    });

    test("keeps the post-capture revision when the capture injects outlines", async () => {
      mockGetSnapshot.mockResolvedValue({
        dom: "<html>outlined</html>",
        screenshot: Buffer.from("img"),
      });
      mockGetDomRevision.mockResolvedValue({ navigations: 0, mutations: 0 });
      mockGeneratePlaywrightCode.mockResolvedValue({ type: "success", result: codeSample });
      const evalCode = jest.fn().mockResolvedValue("done");

      await gen(
        "post capture revision",
        { page: mockPage },
        { model: "gpt-4o", policies: { screenshot: "model" } },
        { store: mockStaticStore },
        evalCode,
      );

      expect(mockGetSnapshot.mock.invocationCallOrder[0]).toBeLessThan(
        mockGetDomRevision.mock.invocationCallOrder[0],
      );
    });
  });

  describe("cost ladder", () => {
    test("starts on the cheap model without screenshots and escalates on failure", async () => {
      mockGetSnapshot
        .mockResolvedValueOnce({ dom: "<html>cheap</html>" })
        .mockResolvedValueOnce({ dom: "<html>primary</html>", screenshot: Buffer.from("img") });
      mockGetDomRevision.mockResolvedValue({ navigations: 0, mutations: 0 });
      mockGeneratePlaywrightCode.mockResolvedValue({ type: "success", result: codeSample });
      const evalCode = jest
        .fn()
        .mockRejectedValueOnce(new Error("boom"))
        .mockResolvedValueOnce("done");

      const result = await gen(
        "ladder task",
        { page: mockPage },
        {
          model: "gpt-4o",
          policies: { screenshot: "model", maxRetries: 2 },
          ladder: { cheapModel: "gpt-4o-mini" },
        },
        { store: mockStaticStore },
        evalCode,
      );

      expect(result).toBe("done");
      expect(mockGeneratePlaywrightCode).toHaveBeenCalledTimes(2);
      expect(mockGeneratePlaywrightCode.mock.calls[0][0].task.options?.model).toBe("gpt-4o-mini");
      expect(mockGeneratePlaywrightCode.mock.calls[0][0].task.pageScreenshot).toBeUndefined();
      expect(mockGeneratePlaywrightCode.mock.calls[1][0].task.options?.model).toBe("gpt-4o");
      expect(mockGeneratePlaywrightCode.mock.calls[1][0].task.pageScreenshot).toEqual(
        Buffer.from("img"),
      );
      expect(mockGetSnapshot.mock.calls[0][2]).toEqual(
        expect.objectContaining({ screenshot: false }),
      );
      expect(mockGetSnapshot.mock.calls[1][2]).toEqual(
        expect.objectContaining({ screenshot: true }),
      );
    });

    test("never sends an image when the first cheap attempt succeeds", async () => {
      mockGetSnapshot.mockResolvedValue({ dom: "<html>cheap</html>" });
      mockGetDomRevision.mockResolvedValue({ navigations: 0, mutations: 0 });
      mockGeneratePlaywrightCode.mockResolvedValue({ type: "success", result: codeSample });
      const evalCode = jest.fn().mockResolvedValue("done");

      await gen(
        "ladder first attempt",
        { page: mockPage },
        {
          model: "gpt-4o",
          policies: { screenshot: "model" },
          ladder: { cheapModel: "gpt-4o-mini" },
        },
        { store: mockStaticStore },
        evalCode,
      );

      expect(mockGeneratePlaywrightCode).toHaveBeenCalledTimes(1);
      expect(mockGeneratePlaywrightCode.mock.calls[0][0].task.options?.model).toBe("gpt-4o-mini");
      expect(mockGeneratePlaywrightCode.mock.calls[0][0].task.pageScreenshot).toBeUndefined();
      expect(mockGetSnapshot).toHaveBeenCalledTimes(1);
      expect(mockGetSnapshot.mock.calls[0][2]).toEqual(
        expect.objectContaining({ screenshot: false }),
      );
    });

    test("ladder true keeps the primary model and only disables screenshots first", async () => {
      mockGetSnapshot.mockResolvedValue({ dom: "<html>primary</html>" });
      mockGetDomRevision.mockResolvedValue({ navigations: 0, mutations: 0 });
      mockGeneratePlaywrightCode.mockResolvedValue({ type: "success", result: codeSample });
      const evalCode = jest.fn().mockResolvedValue("done");

      await gen(
        "ladder same model",
        { page: mockPage },
        { model: "gpt-4o", policies: { screenshot: "model" }, ladder: true },
        { store: mockStaticStore },
        evalCode,
      );

      expect(mockGeneratePlaywrightCode.mock.calls[0][0].task.options?.model).toBe("gpt-4o");
      expect(mockGeneratePlaywrightCode.mock.calls[0][0].task.pageScreenshot).toBeUndefined();
    });

    test("keeps force screenshots on the cheap attempt", async () => {
      mockGetSnapshot.mockResolvedValue({
        dom: "<html>cheap</html>",
        screenshot: Buffer.from("img"),
      });
      mockGetDomRevision.mockResolvedValue({ navigations: 0, mutations: 0 });
      mockGeneratePlaywrightCode.mockResolvedValue({ type: "success", result: codeSample });
      const evalCode = jest.fn().mockResolvedValue("done");

      await gen(
        "ladder force",
        { page: mockPage },
        {
          model: "gpt-4o",
          policies: { screenshot: "force" },
          ladder: { cheapModel: "gpt-4o-mini" },
        },
        { store: mockStaticStore },
        evalCode,
      );

      expect(mockGeneratePlaywrightCode.mock.calls[0][0].task.options?.model).toBe("gpt-4o-mini");
      expect(mockGeneratePlaywrightCode.mock.calls[0][0].task.pageScreenshot).toEqual(
        Buffer.from("img"),
      );
    });

    test("config ladder false disables a cheap model from the environment", async () => {
      mockGetSnapshot.mockResolvedValue({
        dom: "<html>primary</html>",
        screenshot: Buffer.from("img"),
      });
      mockGetDomRevision.mockResolvedValue({ navigations: 0, mutations: 0 });
      mockGeneratePlaywrightCode.mockResolvedValue({ type: "success", result: codeSample });
      const evalCode = jest.fn().mockResolvedValue("done");

      const originalCheapModel = env.CHEAP_MODEL;
      env.CHEAP_MODEL = "gpt-4o-mini";
      try {
        await gen(
          "config ladder off",
          { page: mockPage },
          { model: "gpt-4o", policies: { screenshot: "model" } },
          { store: mockStaticStore },
          evalCode,
        );
      } finally {
        env.CHEAP_MODEL = originalCheapModel;
      }

      expect(mockGeneratePlaywrightCode).toHaveBeenCalledTimes(1);
      expect(mockGeneratePlaywrightCode.mock.calls[0][0].task.options?.model).toBe("gpt-4o");
      expect(mockGeneratePlaywrightCode.mock.calls[0][0].task.pageScreenshot).toEqual(
        Buffer.from("img"),
      );
    });
  });

  describe("cache-hit safety", () => {
    const cachedExpression = "await page.locator('button').click()";

    const makeCachedStore = () => {
      const makeStatic = jest.fn();
      const store: StaticStore = {
        makeIdent: (_title, task) => `ident-${task}`,
        fetchStatic: () => ({ expression: cachedExpression }),
        makeStatic,
      };
      return { store, makeStatic };
    };

    test("throws Gen2EStaleCacheError when the cached expression fails an assertion", async () => {
      const { store, makeStatic } = makeCachedStore();
      const evalCode = jest.fn().mockRejectedValue(new Error("expect(received).toBe(expected)"));

      const promise = gen("assertion task", { page: mockPage }, {}, { store }, evalCode);
      await expect(promise).rejects.toBeInstanceOf(Gen2EStaleCacheError);
      await promise.catch((err: Gen2EStaleCacheError) => {
        expect(err.ident).toBe("ident-assertion task");
        expect(err.expression).toBe(cachedExpression);
        expect(err.meta).toEqual(expect.objectContaining({ errorClass: "assertion" }));
      });
      expect(makeStatic).not.toHaveBeenCalled();
    });

    test("throws Gen2EStaleCacheError in replay-only mode even on locator drift", async () => {
      const { store } = makeCachedStore();
      const evalCode = jest
        .fn()
        .mockRejectedValue(
          new Error(
            "locator.click: Timeout 30000ms exceeded. Call log: - waiting for locator('button')",
          ),
        );

      await expect(
        gen("replay stale task", { page: mockPage }, { replayOnly: true }, { store }, evalCode),
      ).rejects.toBeInstanceOf(Gen2EStaleCacheError);
    });

    test("regenerates locator drift and persists with overwrite", async () => {
      const { store, makeStatic } = makeCachedStore();
      mockGeneratePlaywrightCode.mockResolvedValue({ type: "success", result: codeSample });
      const evalCode = jest
        .fn()
        .mockRejectedValueOnce(
          new Error(
            "locator.click: Timeout 30000ms exceeded. Call log: - waiting for locator('button')",
          ),
        )
        .mockResolvedValueOnce("done");

      const result = await gen("drift task", { page: mockPage }, {}, { store }, evalCode);

      expect(result).toBe("done");
      expect(mockGeneratePlaywrightCode).toHaveBeenCalledTimes(1);
      expect(evalCode).toHaveBeenNthCalledWith(1, cachedExpression, mockPage);
      expect(evalCode).toHaveBeenNthCalledWith(2, codeSample, mockPage);
      expect(makeStatic).toHaveBeenCalledWith(
        "ident-drift task",
        expect.objectContaining({ expression: codeSample }),
        { overwrite: true },
      );
    });
  });

  describe("telemetry wiring", () => {
    const withTelemetryPath = async (fn: (telemetryPath: string) => Promise<void>) => {
      const basePath = mkdtempSync(path.join(tmpdir(), "gen2e-telemetry-"));
      const telemetryPath = path.join(basePath, "telemetry.jsonl");
      const originalFlag = process.env.GEN2E_TELEMETRY;
      const originalPath = process.env.GEN2E_TELEMETRY_PATH;
      process.env.GEN2E_TELEMETRY = "1";
      process.env.GEN2E_TELEMETRY_PATH = telemetryPath;
      try {
        await fn(telemetryPath);
      } finally {
        if (originalFlag === undefined) {
          delete process.env.GEN2E_TELEMETRY;
        } else {
          process.env.GEN2E_TELEMETRY = originalFlag;
        }
        if (originalPath === undefined) {
          delete process.env.GEN2E_TELEMETRY_PATH;
        } else {
          process.env.GEN2E_TELEMETRY_PATH = originalPath;
        }
        rmSync(basePath, { recursive: true, force: true });
      }
    };

    test("emits one line per step including cache hits", async () => {
      await withTelemetryPath(async (telemetryPath) => {
        const evalCode = jest.fn().mockResolvedValue("ok");
        const store: StaticStore = {
          makeIdent: (_title, task) => `ident-${task}`,
          fetchStatic: () => ({ expression: "cached()" }),
          makeStatic: jest.fn(),
        };

        await gen("telemetry hit", { page: mockPage }, {}, { store }, evalCode);

        const lines = readFileSync(telemetryPath, "utf8").trim().split("\n");
        expect(lines).toHaveLength(1);
        expect(JSON.parse(lines[0])).toEqual(
          expect.objectContaining({
            testTitle: "",
            task: "telemetry hit",
            ident: "ident-telemetry hit",
            cache: "hit",
            outcome: "success",
            attempts: 0,
            wallClockMs: expect.any(Number),
            screenshotPolicy: "model",
            promptVersion: "test-prompt-version",
          }),
        );
      });
    });

    test("records a failed cache hit as a hit, not a miss", async () => {
      await withTelemetryPath(async (telemetryPath) => {
        const evalCode = jest.fn().mockRejectedValue(new Error("expect(received).toBe(expected)"));
        const store: StaticStore = {
          makeIdent: (_title, task) => `ident-${task}`,
          fetchStatic: () => ({ expression: "cached()" }),
          makeStatic: jest.fn(),
        };

        await expect(
          gen("telemetry stale hit", { page: mockPage }, {}, { store }, evalCode),
        ).rejects.toBeInstanceOf(Gen2EStaleCacheError);

        const record = JSON.parse(readFileSync(telemetryPath, "utf8").trim());
        expect(record).toEqual(
          expect.objectContaining({
            cache: "hit",
            outcome: "error",
            errorClass: "Gen2EStaleCacheError",
          }),
        );
      });
    });

    test("collects usage without breaking caller hooks", async () => {
      await withTelemetryPath(async (telemetryPath) => {
        const onUsage = jest.fn();
        mockGeneratePlaywrightCode.mockImplementation(async ({ hooks }) => {
          await hooks?.onUsage?.({
            model: "gpt-4o-mini",
            promptTokens: 10,
            completionTokens: 5,
            totalTokens: 15,
            task: { prompt: "prompt", noToolCalls: 2 },
          });
          return { type: "success", result: codeSample };
        });
        const evalCode = jest.fn().mockResolvedValue("ok");
        const store: StaticStore = {
          makeIdent: (_title, task) => `ident-${task}`,
          fetchStatic: () => undefined,
          makeStatic: jest.fn(),
        };

        await gen(
          "telemetry generation",
          { page: mockPage },
          {},
          { store, hooks: { onUsage } },
          evalCode,
        );

        expect(onUsage).toHaveBeenCalledTimes(1);
        expect(JSON.parse(readFileSync(telemetryPath, "utf8").trim())).toEqual(
          expect.objectContaining({
            cache: "miss",
            outcome: "success",
            attempts: 1,
            models: ["gpt-4o-mini"],
            toolCalls: 2,
            promptTokens: 10,
            completionTokens: 5,
            totalTokens: 15,
            costUsd: expect.any(Number),
          }),
        );
      });
    });

    test("records the model of each ladder attempt and its cost", async () => {
      await withTelemetryPath(async (telemetryPath) => {
        mockGetSnapshot.mockResolvedValue({ dom: "<html></html>" });
        mockGetDomRevision.mockResolvedValue({ navigations: 0, mutations: 0 });
        mockGeneratePlaywrightCode.mockImplementation(async ({ task, hooks }) => {
          await hooks?.onUsage?.({
            model: String(task.options?.model),
            promptTokens: 1_000_000,
            completionTokens: 1_000_000,
            totalTokens: 2_000_000,
            task: { prompt: "prompt", noToolCalls: 0 },
          });
          return { type: "success", result: codeSample };
        });
        const evalCode = jest
          .fn()
          .mockRejectedValueOnce(new Error("boom"))
          .mockResolvedValueOnce("done");
        const store: StaticStore = {
          makeIdent: (_title, task) => `ident-${task}`,
          fetchStatic: () => undefined,
          makeStatic: jest.fn(),
        };

        await gen(
          "telemetry ladder",
          { page: mockPage },
          {
            model: "gpt-4o",
            policies: { screenshot: "model", maxRetries: 2 },
            ladder: { cheapModel: "gpt-4o-mini" },
          },
          { store },
          evalCode,
        );

        const record = JSON.parse(readFileSync(telemetryPath, "utf8").trim());
        expect(record.models).toEqual(["gpt-4o-mini", "gpt-4o"]);
        expect(record.costUsd).toBeGreaterThan(0);
      });
    });

    test("omits costUsd for unpriced models", async () => {
      await withTelemetryPath(async (telemetryPath) => {
        mockGeneratePlaywrightCode.mockImplementation(async ({ hooks }) => {
          await hooks?.onUsage?.({
            model: "mystery-model",
            promptTokens: 10,
            completionTokens: 5,
            totalTokens: 15,
            task: { prompt: "prompt", noToolCalls: 0 },
          });
          return { type: "success", result: codeSample };
        });
        const evalCode = jest.fn().mockResolvedValue("ok");
        const store: StaticStore = {
          makeIdent: (_title, task) => `ident-${task}`,
          fetchStatic: () => undefined,
          makeStatic: jest.fn(),
        };

        await gen("telemetry unpriced", { page: mockPage }, {}, { store }, evalCode);

        const record = JSON.parse(readFileSync(telemetryPath, "utf8").trim());
        expect(record.models).toEqual(["mystery-model"]);
        expect(record.costUsd).toBeUndefined();
      });
    });
  });
});
