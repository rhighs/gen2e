import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  Gen2ECacheMissError as Gen2eCacheMissError,
  Gen2EError as Gen2eError,
  FSStaticStore as Gen2eFSStaticStore,
  type StaticStore as Gen2eStaticStore,
} from "@rhighs/gen2e";
import { wrapIdent } from "@rhighs/gen2e-core";
import { runStoreContractTests } from "../../../gen2e/tests/support/store-contract";
import {
  exportStoreToDir,
  FSStaticStore,
  InMemoryStaticStore,
  importDirIntoStore,
  STATIC_BUNDLE_FILE,
} from "../../src";

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
      let store!: typeof FSStaticStore;
      jest.isolateModules(() => {
        store = require("../../src").FSStaticStore;
      });
      return store;
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

  describe("compatibility re-exports from @rhighs/gen2e", () => {
    const acceptStore = (store: Gen2eStaticStore): Gen2eStaticStore => store;

    test("still exposes FSStaticStore, StaticStore and Gen2ECacheMissError", () => {
      expect(acceptStore(Gen2eFSStaticStore)).toBe(Gen2eFSStaticStore);
      expect(typeof Gen2eFSStaticStore.fetchStatic).toBe("function");
      expect(typeof Gen2eFSStaticStore.makeStatic).toBe("function");

      const miss = new Gen2eCacheMissError("ident-1");
      expect(miss).toBeInstanceOf(Gen2eError);
      expect(miss.ident).toBe("ident-1");
    });
  });
});
