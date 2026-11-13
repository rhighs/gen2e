import { afterEach, beforeEach, describe, expect, jest, mock, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { APIRequestContext, BrowserContext } from "@playwright/test";
import { wrapIdent } from "@rhighs/gen2e-core";
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
import { GEN2E_PROMPT_VERSION } from "../../src/playwright-gen";
import { getSnapshot } from "../../src/snapshot";
import { scriptedModel, toolTurn } from "../support/scripted-model";

mock.module("../../src/snapshot", () => ({
  getSnapshot: jest.fn(),
  getDomRevision: jest.fn().mockResolvedValue({ navigations: 0, mutations: 0 }),
  installDomRevisionTracker: jest.fn(),
}));

mock.module("../../src/env", () => ({
  default: {
    OPENAI_MODEL: "davinci",
    DEBUG_MODE: false,
    LOG_STEP: false,
    USE_STATIC_STORE: true,
    REPLAY_ONLY: false,
    STALE_CACHE: "regen",
    CHEAP_MODEL: "",
  },
}));

mock.module("../../src/config", () => ({
  default: { ladder: false },
}));

const mockGetSnapshot = getSnapshot as jest.Mock<typeof getSnapshot>;

const page = { url: () => "https://example.com" } as Page;
const code = "await page.goto('https://example.com')";
const expression = `(async () => { ${code} })`;
const drift = new Error(
  "locator.click: Timeout 30000ms exceeded. Call log: - waiting for locator('button')",
);

const solving = (id = "scripted") =>
  scriptedModel([toolTurn({ name: "run_expression", input: { code } })], id);

const failing = () =>
  scriptedModel([
    toolTurn({ name: "run_expression", input: { code: "await a()" } }),
    toolTurn({ name: "run_expression", input: { code: "await b()" } }),
  ]);

const memoryStore = () => {
  const entries: Record<string, StaticGenStep> = {};
  const makeStatic = jest.fn((ident: string, content: StaticGenStep) => {
    entries[ident] = content;
  });
  const store: StaticStore = {
    makeIdent: (_title, task) => `ident-${task}`,
    fetchStatic: (ident) => entries[ident],
    makeStatic,
  };
  return { store, entries, makeStatic };
};

const cachedStore = (cached: string) => {
  const makeStatic = jest.fn();
  const store: StaticStore = {
    makeIdent: (_title, task) => `ident-${task}`,
    fetchStatic: () => ({ expression: cached }),
    makeStatic,
  };
  return { store, makeStatic };
};

const fixtures = {
  page,
  context: {} as BrowserContext,
  request: {} as APIRequestContext,
};

const withEnv = async (vars: Record<string, string>, fn: () => Promise<void>) => {
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  Object.assign(process.env, vars);
  try {
    await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  }
};

describe("gen", () => {
  beforeEach(() => {
    mockGetSnapshot.mockResolvedValue({ dom: "<html></html>" });
  });

  afterEach(() => {
    gen.useStatic = true;
  });

  test("runs the cached expression without calling the model", async () => {
    const model = solving();
    const { store } = cachedStore(expression);
    const evalCode = jest.fn().mockResolvedValue("cached");

    const res = await gen("task", { page }, { model }, { store }, evalCode);

    expect(res).toBe("cached");
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  test("generates on a miss and caches the expression that ran", async () => {
    const model = solving();
    const { store, entries } = memoryStore();
    const evalCode = jest.fn().mockResolvedValue("done");

    const res = await gen("task", { page }, { model }, { store }, evalCode);

    expect(res).toBe("done");
    expect(entries["ident-task"]?.expression).toBe(expression);
    expect(entries["ident-task"]?.meta).toMatchObject({
      model: "mock-provider:scripted",
      promptVersion: GEN2E_PROMPT_VERSION,
      pageUrl: "https://example.com",
    });
  });

  test("throws Gen2EGenError when no expression works", async () => {
    const { store, makeStatic } = memoryStore();
    const evalCode = jest.fn().mockRejectedValue(new Error("boom"));

    await expect(
      gen("task", { page }, { model: failing(), policies: { maxRetries: 2 } }, { store }, evalCode),
    ).rejects.toBeInstanceOf(Gen2EGenError);
    expect(makeStatic).not.toHaveBeenCalled();
  });

  test("never touches the file store when the store is null", async () => {
    const fetchSpy = jest.spyOn(FSStaticStore, "fetchStatic");
    const makeSpy = jest.spyOn(FSStaticStore, "makeStatic");

    await gen("task", { page }, { model: solving() }, { store: null }, jest.fn());

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(makeSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    makeSpy.mockRestore();
  });

  test("saveContext writes the DOM and screenshot next to the cached step", async () => {
    const basePath = mkdtempSync(path.join(tmpdir(), "gen2e-save-context-"));
    mockGetSnapshot.mockResolvedValue({
      dom: "<html><body>rendered</body></html>",
      screenshot: Buffer.from("fake-image"),
    });
    const { store, entries } = memoryStore();

    try {
      await withEnv({ GEN2E_STATIC_PATH: basePath }, async () => {
        await gen("ctx", { page }, { model: solving(), saveContext: true }, { store }, jest.fn());
      });

      const saved = entries["ident-ctx"];
      const ident = wrapIdent("ident-ctx");
      expect(saved?.context?.refs).toEqual({
        pageUrl: "https://example.com",
        htmlPath: path.join(basePath, "data", `${ident}.gen.html`),
        screenshotPath: path.join(basePath, "data", `${ident}.gen.jpg`),
      });
      expect(existsSync(path.join(basePath, "data", `${ident}.gen.html`))).toBe(true);
      expect(saved?.meta?.domFingerprint).toBe(wrapIdent("<html><body>rendered</body></html>"));
    } finally {
      rmSync(basePath, { recursive: true, force: true });
    }
  });

  test("config ladder false keeps the primary model even with a cheap model in the env", async () => {
    const model = solving();
    const original = env.CHEAP_MODEL;
    env.CHEAP_MODEL = "gpt-4o-mini";

    try {
      await gen("task", { page }, { model }, { store: null }, jest.fn());
    } finally {
      env.CHEAP_MODEL = original;
    }

    expect(model.doGenerateCalls).toHaveLength(1);
  });

  describe("cached steps that fail", () => {
    test("an assertion failure throws Gen2EStaleCacheError and keeps the entry", async () => {
      const { store, makeStatic } = cachedStore(expression);
      const evalCode = jest.fn().mockRejectedValue(new Error("expect(received).toBe(expected)"));

      const err = await gen("task", { page }, {}, { store }, evalCode).catch((e) => e);

      expect(err).toBeInstanceOf(Gen2EStaleCacheError);
      expect(err).toMatchObject({
        ident: "ident-task",
        expression,
        meta: { errorClass: "assertion" },
      });
      expect(makeStatic).not.toHaveBeenCalled();
    });

    test("replay-only mode throws even on locator drift", async () => {
      const { store } = cachedStore(expression);

      await expect(
        gen("task", { page }, { replayOnly: true }, { store }, jest.fn().mockRejectedValue(drift)),
      ).rejects.toBeInstanceOf(Gen2EStaleCacheError);
    });

    test("locator drift regenerates and overwrites the entry", async () => {
      const { store, makeStatic } = cachedStore("await page.locator('button').click()");
      const evalCode = jest.fn().mockRejectedValueOnce(drift).mockResolvedValueOnce("done");

      const res = await gen("task", { page }, { model: solving() }, { store }, evalCode);

      expect(res).toBe("done");
      expect(makeStatic).toHaveBeenCalledWith(
        "ident-task",
        expect.objectContaining({ expression }),
        { overwrite: true },
      );
    });
  });

  describe("gen.test", () => {
    const testStep = { step: (_t: string, fn: () => Promise<unknown>) => fn() } as Test;

    test("rejects when a step fails", async () => {
      const wrapper = gen.test(
        async ({ page, gen: step }) => {
          await step(
            "task",
            { page, test: testStep },
            { model: failing(), policies: { maxRetries: 1 } },
            () => Promise.reject(new Error("boom")),
          );
        },
        { store: memoryStore().store },
      );

      await expect(
        wrapper(fixtures, { title: "t" } as Parameters<typeof wrapper>[1]),
      ).rejects.toThrow();
    });

    test("rethrows library errors unwrapped", async () => {
      const wrapper = gen.test(
        async ({ page, gen: step }) => {
          await step("task", { page, test: testStep }, {}, () =>
            Promise.reject(new Error("expect(received).toBe(expected)")),
          );
        },
        { store: cachedStore("cached()").store },
      );

      await expect(
        wrapper(fixtures, { title: "t" } as Parameters<typeof wrapper>[1]),
      ).rejects.toBeInstanceOf(Gen2EStaleCacheError);
    });
  });

  describe("telemetry", () => {
    const withTelemetry = async (fn: (file: string) => Promise<void>) => {
      const dir = mkdtempSync(path.join(tmpdir(), "gen2e-telemetry-"));
      const file = path.join(dir, "telemetry.jsonl");
      try {
        await withEnv({ GEN2E_TELEMETRY: "1", GEN2E_TELEMETRY_PATH: file }, () => fn(file));
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    };

    const lines = (file: string) =>
      readFileSync(file, "utf8")
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l));

    test("records a cache hit", async () => {
      await withTelemetry(async (file) => {
        await gen("task", { page }, {}, { store: cachedStore("cached()").store }, jest.fn());

        expect(lines(file)).toEqual([
          expect.objectContaining({
            ident: "ident-task",
            cache: "hit",
            outcome: "success",
            attempts: 0,
          }),
        ]);
      });
    });

    test("records a failed cache hit as a hit", async () => {
      await withTelemetry(async (file) => {
        const evalCode = jest.fn().mockRejectedValue(new Error("expect(received).toBe(expected)"));

        await gen("task", { page }, {}, { store: cachedStore("cached()").store }, evalCode).catch(
          () => undefined,
        );

        expect(lines(file)[0]).toMatchObject({
          cache: "hit",
          outcome: "error",
          errorClass: "Gen2EStaleCacheError",
        });
      });
    });

    test("records generation usage, tool calls and cost, and still calls the caller's hook", async () => {
      await withTelemetry(async (file) => {
        const onUsage = jest.fn();

        await gen(
          "task",
          { page },
          { model: solving("gpt-4o-mini") },
          { store: memoryStore().store, hooks: { onUsage } },
          jest.fn(),
        );

        expect(onUsage).toHaveBeenCalledTimes(1);
        expect(lines(file)[0]).toMatchObject({
          cache: "miss",
          outcome: "success",
          attempts: 1,
          models: ["mock-provider:gpt-4o-mini"],
          toolCalls: 1,
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
          costUsd: expect.any(Number),
        });
      });
    });

    test("omits the cost for an unpriced model", async () => {
      await withTelemetry(async (file) => {
        await gen("task", { page }, { model: solving("mystery") }, { store: null }, jest.fn());

        expect(lines(file)[0]?.costUsd).toBeUndefined();
      });
    });
  });
});
