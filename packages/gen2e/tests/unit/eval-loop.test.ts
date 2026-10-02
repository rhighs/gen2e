import {
  Gen2EGenError,
  type Gen2EGenOptions,
  type Gen2EPlaywriteCodeEvalFunc,
  gen,
  type Page,
  type StaticStore,
} from "../../src";
import { createPlaywrightCodeGenAgent, generatePlaywrightCode } from "../../src/playwright-gen";
import { getDomRevision, getSnapshot } from "../../src/snapshot";

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

const mockCreatePlaywrightCodeGenAgent = createPlaywrightCodeGenAgent as jest.MockedFunction<
  typeof createPlaywrightCodeGenAgent
>;
const mockGeneratePlaywrightCode = generatePlaywrightCode as jest.MockedFunction<
  typeof generatePlaywrightCode
>;
const mockGetSnapshot = getSnapshot as jest.MockedFunction<typeof getSnapshot>;
const mockGetDomRevision = getDomRevision as jest.MockedFunction<typeof getDomRevision>;

const codeSample = '(async () => {return async () => (await page.goto("https://example.com"));})';
const mockPage = {
  url: () => "https://example.com",
} as Page;
const mockStaticStore: StaticStore = {
  makeIdent: (_title, task) => `ident-${task}`,
  fetchStatic: () => undefined,
  makeStatic: jest.fn(),
};

const runGen = (
  task: string,
  options: Gen2EGenOptions = {},
  evalCode: Gen2EPlaywriteCodeEvalFunc = jest.fn().mockResolvedValue("done"),
) => gen(task, { page: mockPage }, options, { store: mockStaticStore }, evalCode);

const firstGenerateCall = () => mockGeneratePlaywrightCode.mock.calls[0][0];
const secondGenerateCall = () => mockGeneratePlaywrightCode.mock.calls[1][0];

describe("eval loop screenshot policy", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSnapshot.mockReset();
    mockGetSnapshot.mockResolvedValue({ dom: "<html></html>" });
    mockGetDomRevision.mockReset();
    mockGetDomRevision.mockResolvedValue({ navigations: 0, mutations: 0 });
    mockCreatePlaywrightCodeGenAgent.mockReset();
    mockCreatePlaywrightCodeGenAgent.mockReturnValue(jest.fn());
    mockGeneratePlaywrightCode.mockResolvedValue({ type: "success", result: codeSample });
  });

  test("model policy captures a screenshot for a vision model", async () => {
    const image = Buffer.from("vision-image");
    mockGetSnapshot.mockResolvedValue({ dom: "<html>vision</html>", screenshot: image });

    await runGen("vision model screenshot", {
      model: "gpt-4o",
      policies: { screenshot: "model" },
    });

    expect(mockGetSnapshot.mock.calls[0][2]).toEqual(expect.objectContaining({ screenshot: true }));
    expect(firstGenerateCall().task.pageScreenshot).toEqual(image);
  });

  test("model policy skips the screenshot for a non-vision model", async () => {
    mockGetSnapshot.mockResolvedValue({
      dom: "<html>text only</html>",
      screenshot: Buffer.from("unused"),
    });

    await runGen("non vision model screenshot", {
      model: "gpt-3.5-turbo",
      policies: { screenshot: "model" },
    });

    expect(mockGetSnapshot.mock.calls[0][2]).toEqual(
      expect.objectContaining({ screenshot: false }),
    );
    expect(firstGenerateCall().task.pageScreenshot).toBeUndefined();
  });

  test("off policy skips the screenshot even for a vision model", async () => {
    mockGetSnapshot.mockResolvedValue({
      dom: "<html>off</html>",
      screenshot: Buffer.from("unused"),
    });

    await runGen("off policy", { model: "gpt-4o", policies: { screenshot: "off" } });

    expect(mockGetSnapshot.mock.calls[0][2]).toEqual(
      expect.objectContaining({ screenshot: false }),
    );
    expect(firstGenerateCall().task.pageScreenshot).toBeUndefined();
  });

  test("force policy attaches the screenshot to a non-vision model", async () => {
    const image = Buffer.from("forced-image");
    mockGetSnapshot.mockResolvedValue({ dom: "<html>forced</html>", screenshot: image });

    await runGen("force policy", { model: "gpt-3.5-turbo", policies: { screenshot: "force" } });

    expect(mockGetSnapshot.mock.calls[0][2]).toEqual(expect.objectContaining({ screenshot: true }));
    expect(firstGenerateCall().task.pageScreenshot).toEqual(image);
  });

  test("onfail policy escalates a vision model after a failed attempt", async () => {
    const image = Buffer.from("escalated-image");
    mockGetSnapshot
      .mockResolvedValueOnce({ dom: "<html>first</html>" })
      .mockResolvedValueOnce({ dom: "<html>second</html>", screenshot: image });
    const evalCode = jest
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce("done");

    const result = await runGen(
      "onfail escalation",
      { model: "gpt-4o", policies: { screenshot: "onfail", maxRetries: 2 } },
      evalCode,
    );

    expect(result).toBe("done");
    expect(mockGetSnapshot).toHaveBeenCalledTimes(2);
    expect(mockGetSnapshot.mock.calls[0][2]).toEqual(
      expect.objectContaining({ screenshot: false }),
    );
    expect(mockGetSnapshot.mock.calls[1][2]).toEqual(expect.objectContaining({ screenshot: true }));
    expect(firstGenerateCall().task.pageScreenshot).toBeUndefined();
    expect(secondGenerateCall().task.pageScreenshot).toEqual(image);
    expect(secondGenerateCall().task.domSnapshot).toBe("<html>second</html>");
  });

  test("onfail policy never escalates a non-vision model", async () => {
    const evalCode = jest
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce("done");

    const result = await runGen(
      "onfail no escalation",
      { model: "gpt-3.5-turbo", policies: { screenshot: "onfail", maxRetries: 2 } },
      evalCode,
    );

    expect(result).toBe("done");
    expect(mockGetSnapshot).toHaveBeenCalledTimes(1);
    expect(mockGetSnapshot.mock.calls[0][2]).toEqual(
      expect.objectContaining({ screenshot: false }),
    );
    expect(secondGenerateCall().task.pageScreenshot).toBeUndefined();
  });
});

describe("eval loop retries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSnapshot.mockReset();
    mockGetSnapshot.mockResolvedValue({ dom: "<html></html>" });
    mockGetDomRevision.mockReset();
    mockGetDomRevision.mockResolvedValue({ navigations: 0, mutations: 0 });
    mockCreatePlaywrightCodeGenAgent.mockReset();
    mockCreatePlaywrightCodeGenAgent.mockReturnValue(jest.fn());
    mockGeneratePlaywrightCode.mockResolvedValue({ type: "success", result: codeSample });
  });

  test("throws Gen2EGenError after exhausting retries on generation errors", async () => {
    mockGeneratePlaywrightCode.mockResolvedValue({
      type: "error",
      errorMessage: "generation failed",
    });

    await expect(runGen("exhaust generation", { policies: { maxRetries: 3 } })).rejects.toThrow(
      Gen2EGenError,
    );

    expect(mockGeneratePlaywrightCode).toHaveBeenCalledTimes(3);
    // generation-level failures never invalidate the capture
    expect(mockGetSnapshot).toHaveBeenCalledTimes(1);
  });

  test("throws Gen2EGenError carrying the eval errors after exhausting retries", async () => {
    const evalCode = jest.fn().mockRejectedValue(new Error("always broken"));

    const promise = runGen("exhaust eval", { policies: { maxRetries: 2 } }, evalCode);
    await expect(promise).rejects.toThrow(Gen2EGenError);
    await promise.catch((err: Gen2EGenError) => {
      expect(err.message).toContain("always broken");
    });

    expect(evalCode).toHaveBeenCalledTimes(2);
    expect(mockGeneratePlaywrightCode).toHaveBeenCalledTimes(2);
  });

  test("attempt 2 receives previousErrors and previousAttempts", async () => {
    const evalCode = jest
      .fn()
      .mockRejectedValueOnce(new Error("first failure"))
      .mockResolvedValueOnce("done");

    await runGen("previous attempt context", { policies: { maxRetries: 2 } }, evalCode);

    expect(firstGenerateCall().task.previousErrors).toBe("");
    expect(firstGenerateCall().task.previousAttempts).toBe("");
    expect(secondGenerateCall().task.previousErrors).toBe("0. Error: first failure");
    expect(secondGenerateCall().task.previousAttempts).toBe(`0. ${codeSample}`);
  });
});

describe("eval loop capture lifecycle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSnapshot.mockReset();
    mockGetSnapshot.mockResolvedValue({ dom: "<html></html>" });
    mockGetDomRevision.mockReset();
    mockGetDomRevision.mockResolvedValue({ navigations: 0, mutations: 0 });
    mockCreatePlaywrightCodeGenAgent.mockReset();
    mockCreatePlaywrightCodeGenAgent.mockReturnValue(jest.fn());
    mockGeneratePlaywrightCode.mockResolvedValue({ type: "success", result: codeSample });
  });

  test("captures once across multiple generation-error retries", async () => {
    mockGeneratePlaywrightCode
      .mockResolvedValueOnce({ type: "error", errorMessage: "first" })
      .mockResolvedValueOnce({ type: "error", errorMessage: "second" })
      .mockResolvedValueOnce({ type: "success", result: codeSample });

    await runGen("generation retries", { policies: { maxRetries: 3 } });

    expect(mockGeneratePlaywrightCode).toHaveBeenCalledTimes(3);
    expect(mockGetSnapshot).toHaveBeenCalledTimes(1);
    expect(mockGetDomRevision).toHaveBeenCalledTimes(1);
    for (const call of mockGeneratePlaywrightCode.mock.calls) {
      expect(call[0].task.domSnapshot).toBe("<html></html>");
    }
  });

  test("recaptures when a generation error escalates the screenshot policy", async () => {
    mockGetSnapshot.mockResolvedValueOnce({ dom: "<html>no image</html>" }).mockResolvedValueOnce({
      dom: "<html>with image</html>",
      screenshot: Buffer.from("img"),
    });
    mockGetDomRevision.mockResolvedValue({ navigations: 0, mutations: 0 });
    mockGeneratePlaywrightCode
      .mockResolvedValueOnce({ type: "error", errorMessage: "generation failed" })
      .mockResolvedValueOnce({ type: "success", result: codeSample });

    const result = await runGen("generation error escalation", {
      model: "gpt-4o",
      policies: { screenshot: "onfail", maxRetries: 2 },
    });

    expect(result).toBe("done");
    expect(mockGetSnapshot).toHaveBeenCalledTimes(2);
    expect(mockGetSnapshot.mock.calls[1][2]).toEqual(expect.objectContaining({ screenshot: true }));
    expect(firstGenerateCall().task.pageScreenshot).toBeUndefined();
    expect(secondGenerateCall().task.pageScreenshot).toEqual(Buffer.from("img"));
  });

  test("recaptures when the mutation counter grew after an eval failure", async () => {
    mockGetSnapshot
      .mockResolvedValueOnce({ dom: "<html>before</html>" })
      .mockResolvedValueOnce({ dom: "<html>after</html>" });
    mockGetDomRevision
      .mockResolvedValueOnce({ navigations: 0, mutations: 0 })
      .mockResolvedValueOnce({ navigations: 0, mutations: 2 })
      .mockResolvedValueOnce({ navigations: 0, mutations: 2 });
    const evalCode = jest
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce("done");

    const result = await runGen("recapture on mutation", { policies: { maxRetries: 2 } }, evalCode);

    expect(result).toBe("done");
    expect(mockGetSnapshot).toHaveBeenCalledTimes(2);
    expect(mockGetDomRevision).toHaveBeenCalledTimes(3);
    expect(firstGenerateCall().task.domSnapshot).toBe("<html>before</html>");
    expect(secondGenerateCall().task.domSnapshot).toBe("<html>after</html>");
  });

  test("recaptures when the navigation counter grew after an eval failure", async () => {
    mockGetSnapshot
      .mockResolvedValueOnce({ dom: "<html>before</html>" })
      .mockResolvedValueOnce({ dom: "<html>after</html>" });
    mockGetDomRevision
      .mockResolvedValueOnce({ navigations: 0, mutations: 0 })
      .mockResolvedValueOnce({ navigations: 1, mutations: 0 })
      .mockResolvedValueOnce({ navigations: 1, mutations: 0 });
    const evalCode = jest
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce("done");

    await runGen("recapture on navigation", { policies: { maxRetries: 2 } }, evalCode);

    expect(mockGetSnapshot).toHaveBeenCalledTimes(2);
    expect(secondGenerateCall().task.domSnapshot).toBe("<html>after</html>");
  });

  test("reuses the capture when the revision is unchanged", async () => {
    const evalCode = jest
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce("done");

    await runGen("reuse on stable revision", { policies: { maxRetries: 2 } }, evalCode);

    expect(mockGetSnapshot).toHaveBeenCalledTimes(1);
    expect(mockGetDomRevision).toHaveBeenCalledTimes(2);
    expect(secondGenerateCall().task.domSnapshot).toBe("<html></html>");
  });
});
