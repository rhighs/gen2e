import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { defaultMakeIdentFromContext } from "@rhighs/gen2e-core";
import {
  FSStaticStore,
  Gen2ECacheMissError,
  Gen2EError,
  gen,
  type Page,
  type StaticStore,
} from "../../../src";

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

  test("re-exports FSStaticStore, StaticStore and Gen2ECacheMissError", () => {
    const acceptStore = (store: StaticStore): StaticStore => store;

    expect(acceptStore(FSStaticStore)).toBe(FSStaticStore);

    const miss = new Gen2ECacheMissError("ident-1");
    expect(miss).toBeInstanceOf(Gen2EError);
    expect(miss.ident).toBe("ident-1");
  });

  describe("defaultMakeIdentFromContext", () => {
    const base = {
      testTitle: "title test",
      task: "click the button",
      pageUrl: "https://example.com/a?b=1",
      promptVersion: "v1",
      model: "gpt-4o-mini",
    };

    test("ignores everything but the origin of the page url", () => {
      expect(defaultMakeIdentFromContext({ ...base, pageUrl: "https://example.com/other" })).toBe(
        defaultMakeIdentFromContext(base),
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
