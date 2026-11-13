import type { StaticGenStep, StaticStore } from "@rhighs/gen2e-core";

/**
 * Extra hooks a concrete store can provide to make the generic contract
 * runnable. Everything is optional so a store with fewer capabilities still
 * gets the cases it can express.
 */
export type StoreContractOptions = {
  /**
   * Writes raw bytes for an identifier, bypassing the store API. Used to seed
   * malformed and empty entries. Without it the malformed-entry case is
   * skipped.
   */
  seedRaw?: (ident: string, raw: string) => void;
};

const sampleStep: StaticGenStep = {
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

/**
 * Registers the behavioral contract every StaticStore implementation must
 * satisfy: misses, roundtrips, malformed entries, write contention, overwrite,
 * quarantine and versioned identity stability.
 *
 * @param name - Store name used in the describe title.
 * @param makeStore - Builds a fresh, isolated store per test case.
 * @param options - Optional capabilities the concrete store can expose.
 */
export const runStoreContractTests = (
  name: string,
  makeStore: () => StaticStore,
  options: StoreContractOptions = {},
): void => {
  describe(`${name} store contract`, () => {
    test("a miss returns undefined", () => {
      expect(makeStore().fetchStatic("missing")).toBeUndefined();
    });

    test("roundtrips an entry including meta", () => {
      const store = makeStore();
      store.makeStatic("roundtrip", sampleStep);
      expect(store.fetchStatic("roundtrip")).toEqual(sampleStep);
    });

    test("malformed or empty entries fetch as undefined", () => {
      if (!options.seedRaw) {
        // the store has no raw write path, the case is not expressible
        return;
      }

      const store = makeStore();
      options.seedRaw("broken", "{not json");
      options.seedRaw("empty", JSON.stringify({ expression: "" }));

      expect(store.fetchStatic("broken")).toBeUndefined();
      expect(store.fetchStatic("empty")).toBeUndefined();
    });

    test("keeps the first writer under contention without throwing", () => {
      const store = makeStore();
      store.makeStatic("contended", { expression: "first()" });

      expect(() => store.makeStatic("contended", { expression: "second()" })).not.toThrow();
      expect(store.fetchStatic("contended")).toEqual({ expression: "first()" });
    });

    test("overwrite replaces the existing entry", () => {
      const store = makeStore();
      store.makeStatic("overwritten", { expression: "first()" });
      store.makeStatic("overwritten", { expression: "second()" }, { overwrite: true });

      expect(store.fetchStatic("overwritten")).toEqual({ expression: "second()" });
    });

    test("quarantine removes the entry from fetch", () => {
      const store = makeStore();
      if (typeof store.quarantine !== "function") {
        return;
      }

      store.makeStatic("poisoned", { expression: "bad()" });
      store.quarantine("poisoned", "invalid expression");

      expect(store.fetchStatic("poisoned")).toBeUndefined();
    });

    describe("versioned ident stability", () => {
      const base = {
        testTitle: "title test",
        task: "click the button",
        pageUrl: "https://example.com/a?b=1",
        promptVersion: "v1",
        model: "gpt-4o-mini",
      };

      test("is stable for identical inputs", () => {
        const store = makeStore();
        if (typeof store.makeIdentFromContext !== "function") {
          return;
        }

        expect(store.makeIdentFromContext(base)).toBe(store.makeIdentFromContext({ ...base }));
      });

      test("changes when model, promptVersion or origin changes", () => {
        const store = makeStore();
        if (typeof store.makeIdentFromContext !== "function") {
          return;
        }

        const ident = store.makeIdentFromContext(base);
        expect(store.makeIdentFromContext({ ...base, model: "gpt-5" })).not.toBe(ident);
        expect(store.makeIdentFromContext({ ...base, promptVersion: "v2" })).not.toBe(ident);
        expect(
          store.makeIdentFromContext({ ...base, pageUrl: "https://other.com/a?b=1" }),
        ).not.toBe(ident);
      });
    });
  });
};
