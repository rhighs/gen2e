import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  FSStaticStore,
  Gen2ECacheMissError,
  gen,
  type Page,
  type StaticGenStep,
  type StaticStore,
} from "../../../src";
import { defaultMakeIdentFromContext, wrapIdent } from "../../../src/static/ident";

describe("static store contract", () => {
  let basePath: string;
  const originalStaticPath = process.env.GEN2E_STATIC_PATH;

  beforeEach(() => {
    basePath = mkdtempSync(path.join(tmpdir(), "gen2e-store-"));
    process.env.GEN2E_STATIC_PATH = basePath;
    gen.useStatic = true;
  });

  afterEach(() => {
    if (originalStaticPath === undefined) {
      delete process.env.GEN2E_STATIC_PATH;
    } else {
      process.env.GEN2E_STATIC_PATH = originalStaticPath;
    }
    rmSync(basePath, { recursive: true, force: true });
  });

  test("roundtrips a static step including meta", () => {
    const step: StaticGenStep = {
      expression: "await page.title()",
      context: {
        task: "get the page title",
        testTitle: "title test",
        refs: { pageUrl: "https://example.com/" },
      },
      meta: {
        generatedAt: "2026-10-02T00:00:00.000Z",
        model: "gpt-4o-mini",
        promptVersion: "2026-10-02.1",
        pageUrl: "https://example.com/",
        attempts: 1,
      },
    };

    FSStaticStore.makeStatic("roundtrip", step);

    expect(FSStaticStore.fetchStatic("roundtrip")).toEqual(step);
  });

  test("fetches malformed or empty entries as undefined", () => {
    const stepsDir = path.join(basePath, "steps");
    mkdirSync(stepsDir, { recursive: true });
    writeFileSync(path.join(stepsDir, `${wrapIdent("broken")}.gen.step`), "{not json");
    writeFileSync(
      path.join(stepsDir, `${wrapIdent("empty")}.gen.step`),
      JSON.stringify({ expression: "" }),
    );

    expect(FSStaticStore.fetchStatic("broken")).toBeUndefined();
    expect(FSStaticStore.fetchStatic("empty")).toBeUndefined();
  });

  test("first writer wins and leaves no tmp files behind", () => {
    const first: StaticGenStep = { expression: "first()" };
    const second: StaticGenStep = { expression: "second()" };

    FSStaticStore.makeStatic("contended", first);
    expect(() => FSStaticStore.makeStatic("contended", second)).not.toThrow();

    expect(FSStaticStore.fetchStatic("contended")).toEqual(first);
    const leftovers = readdirSync(path.join(basePath, "steps")).filter((file) =>
      file.includes(".tmp-"),
    );
    expect(leftovers).toEqual([]);
  });

  test("overwrite replaces the existing entry", () => {
    FSStaticStore.makeStatic("overwritten", { expression: "first()" });
    FSStaticStore.makeStatic("overwritten", { expression: "second()" }, { overwrite: true });

    expect(FSStaticStore.fetchStatic("overwritten")).toEqual({ expression: "second()" });
  });

  test("quarantine moves the entry out of steps", () => {
    FSStaticStore.makeStatic("poisoned", { expression: "bad()" });

    FSStaticStore.quarantine?.("poisoned", "invalid expression");

    expect(FSStaticStore.fetchStatic("poisoned")).toBeUndefined();
    expect(readdirSync(path.join(basePath, "steps"))).toEqual([]);
    const quarantined = readdirSync(path.join(basePath, "quarantine"));
    expect(quarantined).toHaveLength(1);
    expect(quarantined[0]).toMatch(/^[a-f0-9]+\.\d+\.gen\.step$/);
  });

  describe("defaultMakeIdentFromContext", () => {
    const base = {
      testTitle: "title test",
      task: "click the button",
      pageUrl: "https://example.com/a?b=1",
      promptVersion: "v1",
      model: "gpt-4o-mini",
    };

    test("is stable for identical inputs", () => {
      expect(defaultMakeIdentFromContext(base)).toBe(defaultMakeIdentFromContext({ ...base }));
    });

    test("ignores everything but the origin of the page url", () => {
      expect(defaultMakeIdentFromContext({ ...base, pageUrl: "https://example.com/other" })).toBe(
        defaultMakeIdentFromContext(base),
      );
    });

    test("changes when model, promptVersion or origin changes", () => {
      const ident = defaultMakeIdentFromContext(base);
      expect(defaultMakeIdentFromContext({ ...base, model: "gpt-5" })).not.toBe(ident);
      expect(defaultMakeIdentFromContext({ ...base, promptVersion: "v2" })).not.toBe(ident);
      expect(defaultMakeIdentFromContext({ ...base, pageUrl: "https://other.com/a?b=1" })).not.toBe(
        ident,
      );
    });

    test("falls back to the raw page url when it cannot be parsed", () => {
      expect(defaultMakeIdentFromContext({ ...base, pageUrl: "not a url" })).toBe(
        defaultMakeIdentFromContext({ ...base, pageUrl: "not a url" }),
      );
      expect(defaultMakeIdentFromContext({ ...base, pageUrl: "not a url" })).not.toBe(
        defaultMakeIdentFromContext({ ...base, pageUrl: "also not a url" }),
      );
    });
  });

  describe("replay-only mode", () => {
    const page = { url: () => "https://example.com" } as Page;

    test("throws Gen2ECacheMissError carrying the ident on a cache miss", async () => {
      const fetchStatic = jest.fn().mockReturnValue(undefined);
      const makeStatic = jest.fn();
      const store: StaticStore = {
        makeIdent: (_title, task) => `ident-${task}`,
        fetchStatic,
        makeStatic,
      };

      const result = gen("missing task", { page }, { replayOnly: true }, { store });
      await expect(result).rejects.toBeInstanceOf(Gen2ECacheMissError);
      await result.catch((err: Gen2ECacheMissError) => {
        expect(err.ident).toBe("ident-missing task");
      });
      expect(fetchStatic).toHaveBeenCalledWith("ident-missing task");
      expect(makeStatic).not.toHaveBeenCalled();
    });

    test("does not touch the file system on a cache miss", async () => {
      await expect(gen("missing task", { page }, { replayOnly: true })).rejects.toBeInstanceOf(
        Gen2ECacheMissError,
      );

      expect(readdirSync(basePath)).toEqual([]);
    });

    test("serves a cache hit without ever writing", async () => {
      const evalCode = jest.fn().mockResolvedValue("ok");
      const makeStatic = jest.fn();
      const store: StaticStore = {
        makeIdent: () => "hit",
        fetchStatic: () => ({ expression: "await page.title()" }),
        makeStatic,
      };

      await expect(gen("task", { page }, { replayOnly: true }, { store }, evalCode)).resolves.toBe(
        "ok",
      );

      expect(evalCode).toHaveBeenCalledWith("await page.title()", page);
      expect(makeStatic).not.toHaveBeenCalled();
    });
  });
});
