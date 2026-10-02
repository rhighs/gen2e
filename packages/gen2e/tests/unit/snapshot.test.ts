import type { Page } from "@playwright/test";
import { getDomRevision, getSnapshot, installDomRevisionTracker } from "../../src/snapshot";

type MockPage = Page & {
  waitForLoadState: jest.Mock;
  content: jest.Mock;
  frames: jest.Mock;
  evaluate: jest.Mock;
  url: jest.Mock;
  on: jest.Mock;
  addInitScript: jest.Mock;
};

const makePage = (overrides: Record<string, unknown> = {}): MockPage =>
  ({
    waitForLoadState: jest.fn().mockResolvedValue(undefined),
    content: jest.fn().mockResolvedValue("<html><body>hello</body></html>"),
    frames: jest.fn().mockReturnValue([]),
    evaluate: jest.fn().mockResolvedValue(null),
    url: jest.fn().mockReturnValue("https://example.com"),
    on: jest.fn(),
    addInitScript: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  }) as unknown as MockPage;

const timeoutError = (): Error => {
  const error = new Error("Timeout 2000ms exceeded.") as Error & { name: string };
  error.name = "TimeoutError";
  return error;
};

describe("getSnapshot network idle", () => {
  test("swallows network idle timeouts and still captures the dom", async () => {
    const page = makePage();
    page.waitForLoadState.mockImplementation(async (state: string) => {
      if (state === "networkidle") {
        throw timeoutError();
      }
    });

    const snapshot = await getSnapshot(page);

    expect(snapshot.dom).toContain("hello");
    expect(page.waitForLoadState).toHaveBeenCalledWith("domcontentloaded");
    expect(page.waitForLoadState).toHaveBeenCalledWith("networkidle", { timeout: 2000 });
  });

  test("rethrows non-timeout load state errors", async () => {
    const page = makePage();
    page.waitForLoadState.mockImplementation(async (state: string) => {
      if (state === "networkidle") {
        throw new Error("boom");
      }
    });

    await expect(getSnapshot(page)).rejects.toThrow("boom");
  });

  test("honors the option and the env override for the timeout", async () => {
    const page = makePage();
    await getSnapshot(page, undefined, { networkIdleTimeoutMs: 50 });
    expect(page.waitForLoadState).toHaveBeenCalledWith("networkidle", { timeout: 50 });

    const original = process.env.GEN2E_NETWORKIDLE_TIMEOUT_MS;
    process.env.GEN2E_NETWORKIDLE_TIMEOUT_MS = "75";
    try {
      const envPage = makePage();
      await getSnapshot(envPage);
      expect(envPage.waitForLoadState).toHaveBeenCalledWith("networkidle", { timeout: 75 });
    } finally {
      if (original === undefined) {
        delete process.env.GEN2E_NETWORKIDLE_TIMEOUT_MS;
      } else {
        process.env.GEN2E_NETWORKIDLE_TIMEOUT_MS = original;
      }
    }
  });
});

describe("dom revision tracking", () => {
  test("returns zeros for mocks without frames/on/evaluate", async () => {
    const bare = {} as Page;

    await installDomRevisionTracker(bare);

    await expect(getDomRevision(bare)).resolves.toEqual({ navigations: 0, mutations: 0 });
  });

  test("installs the counter in the document that is already open", async () => {
    const page = makePage();

    await installDomRevisionTracker(page);

    expect(page.evaluate).toHaveBeenCalledTimes(1);
    expect(page.evaluate).toHaveBeenCalledWith(expect.any(Function));
  });

  test("installs the counter in every open frame and survives cross-origin frames", async () => {
    const frames = [
      { evaluate: jest.fn().mockResolvedValue(undefined) },
      { evaluate: jest.fn().mockRejectedValue(new Error("cross origin")) },
    ];
    const page = makePage({ frames: jest.fn().mockReturnValue(frames) });

    await expect(installDomRevisionTracker(page)).resolves.toBeUndefined();

    expect(frames[0].evaluate).toHaveBeenCalledWith(expect.any(Function));
    expect(frames[1].evaluate).toHaveBeenCalledWith(expect.any(Function));
  });

  test("counts frame navigations and sums frame mutations", async () => {
    const listeners: Record<string, Array<() => void>> = {};
    const frames = [
      { evaluate: jest.fn().mockResolvedValue(3) },
      { evaluate: jest.fn().mockRejectedValue(new Error("cross origin")) },
    ];
    const page = makePage({
      on: jest.fn((event: string, handler: () => void) => {
        const registered = listeners[event];
        if (registered) {
          registered.push(handler);
        } else {
          listeners[event] = [handler];
        }
      }),
      frames: jest.fn().mockReturnValue(frames),
    });

    installDomRevisionTracker(page);
    installDomRevisionTracker(page);

    expect(page.on).toHaveBeenCalledTimes(1);
    expect(page.addInitScript).toHaveBeenCalledTimes(1);

    for (const handler of listeners.framenavigated ?? []) {
      handler();
    }

    await expect(getDomRevision(page)).resolves.toEqual({ navigations: 1, mutations: 3 });
  });
});
