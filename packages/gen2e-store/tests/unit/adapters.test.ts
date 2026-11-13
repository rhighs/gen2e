import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { wrapIdent } from "@rhighs/gen2e-core";
import {
  exportStoreToDir,
  FSStaticStore,
  InMemoryStaticStore,
  importDirIntoStore,
  STATIC_BUNDLE_FILE,
} from "../../src";
import { runStoreContractTests } from "../support/store-contract";

describe("static store adapters", () => {
  let basePath: string;
  const originalStaticPath = process.env.GEN2E_STATIC_PATH;

  beforeEach(() => {
    basePath = mkdtempSync(path.join(tmpdir(), "gen2e-store-adapter-"));
    process.env.GEN2E_STATIC_PATH = basePath;
  });

  afterEach(() => {
    if (originalStaticPath === undefined) {
      delete process.env.GEN2E_STATIC_PATH;
    } else {
      process.env.GEN2E_STATIC_PATH = originalStaticPath;
    }
    rmSync(basePath, { recursive: true, force: true });
  });

  runStoreContractTests("FSStaticStore", () => FSStaticStore, {
    seedRaw: (ident, raw) => {
      const stepsDir = path.join(basePath, "steps");
      mkdirSync(stepsDir, { recursive: true });
      writeFileSync(path.join(stepsDir, `${wrapIdent(ident)}.gen.step`), raw);
    },
  });

  runStoreContractTests("InMemoryStaticStore", () => new InMemoryStaticStore());

  test("quarantine moves the entry out of the steps directory", () => {
    FSStaticStore.makeStatic("poisoned", { expression: "bad()" });

    FSStaticStore.quarantine?.("poisoned", "invalid expression");

    expect(readdirSync(path.join(basePath, "steps"))).toEqual([]);
    const quarantined = readdirSync(path.join(basePath, "quarantine"));
    expect(quarantined).toHaveLength(1);
    expect(quarantined[0]).toMatch(/^[a-f0-9]+\.\d+\.gen\.step$/);
  });

  describe("cache bundles", () => {
    test("exports and re-imports a file system store", () => {
      FSStaticStore.makeStatic("bundle-fs", { expression: "await page.title()" });

      const bundleDir = path.join(basePath, "bundle");
      expect(exportStoreToDir(FSStaticStore, bundleDir)).toBe(1);
      expect(existsSync(path.join(bundleDir, STATIC_BUNDLE_FILE))).toBe(true);

      const nextBasePath = mkdtempSync(path.join(tmpdir(), "gen2e-store-import-"));
      process.env.GEN2E_STATIC_PATH = nextBasePath;
      try {
        expect(importDirIntoStore(bundleDir, FSStaticStore)).toBe(1);
        expect(FSStaticStore.fetchStatic("bundle-fs")).toEqual({
          expression: "await page.title()",
        });
      } finally {
        rmSync(nextBasePath, { recursive: true, force: true });
      }
    });

    test("roundtrips an in-memory store through a bundle directory", () => {
      const store = new InMemoryStaticStore();
      store.makeStatic("mem-entry", { expression: "1 + 1" });

      const dir = path.join(basePath, "memory-bundle");
      expect(exportStoreToDir(store, dir)).toBe(1);

      const restored = new InMemoryStaticStore();
      expect(importDirIntoStore(dir, restored)).toBe(1);
      expect(restored.fetchStatic("mem-entry")).toEqual({ expression: "1 + 1" });
    });

    test("imports nothing when the bundle file is missing", () => {
      expect(importDirIntoStore(path.join(basePath, "missing"), new InMemoryStaticStore())).toBe(0);
    });

    test("throws on a malformed bundle", () => {
      const dir = path.join(basePath, "malformed-bundle");
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, STATIC_BUNDLE_FILE), "{not json");

      expect(() => importDirIntoStore(dir, new InMemoryStaticStore())).toThrow();
    });
  });

  describe("preloaded entries", () => {
    const originalPreload = process.env.GEN2E_PRELOAD_ENABLED;

    afterEach(() => {
      if (originalPreload === undefined) {
        delete process.env.GEN2E_PRELOAD_ENABLED;
      } else {
        process.env.GEN2E_PRELOAD_ENABLED = originalPreload;
      }
    });

    const requirePreloadedStore = (): typeof FSStaticStore => {
      process.env.GEN2E_PRELOAD_ENABLED = "1";
      const fsModule = require.resolve("../../src/fs");
      delete require.cache[fsModule];
      return require(fsModule).FSStaticStore;
    };

    test("overwrite refreshes an entry that was preloaded at import time", () => {
      FSStaticStore.makeStatic("preload-overwrite", { expression: "old()" });
      const preloadedStore = requirePreloadedStore();

      expect(preloadedStore.fetchStatic("preload-overwrite")).toEqual({ expression: "old()" });

      preloadedStore.makeStatic("preload-overwrite", { expression: "new()" }, { overwrite: true });

      expect(preloadedStore.fetchStatic("preload-overwrite")).toEqual({ expression: "new()" });
    });

    test("imports refresh an entry that was preloaded at import time", () => {
      FSStaticStore.makeStatic("preload-import", { expression: "old()" });
      const preloadedStore = requirePreloadedStore();

      expect(preloadedStore.fetchStatic("preload-import")).toEqual({ expression: "old()" });

      preloadedStore.importEntries(
        [{ key: wrapIdent("preload-import"), content: { expression: "new()" } }],
        { overwrite: true },
      );

      expect(preloadedStore.fetchStatic("preload-import")).toEqual({ expression: "new()" });
    });
  });
});
