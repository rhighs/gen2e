import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { StaticGenStep, StaticStore } from "@rhighs/gen2e-core";

// `key` is the store's raw key, so a bundle is exact only between stores of the same kind.
export type BundleEntry = {
  key: string;
  content: StaticGenStep;
};

export interface BundleableStaticStore extends StaticStore {
  exportEntries: () => BundleEntry[];
  importEntries: (entries: BundleEntry[], options?: { overwrite?: boolean }) => number;
}

export const STATIC_BUNDLE_FILE = "gen2e-static-bundle.json";

export type StaticStoreBundle = {
  version: 1;
  exportedAt: string;
  entries: Record<string, StaticGenStep>;
};

export const exportStoreToDir = (store: BundleableStaticStore, dir: string): number => {
  const entries = store.exportEntries();
  mkdirSync(dir, { recursive: true });

  const bundle: StaticStoreBundle = {
    version: 1,
    exportedAt: new Date().toISOString(),
    entries: Object.fromEntries(entries.map((entry) => [entry.key, entry.content])),
  };
  writeFileSync(path.join(dir, STATIC_BUNDLE_FILE), JSON.stringify(bundle, null, 2));
  return entries.length;
};

// A missing bundle file imports nothing; a malformed one throws.
export const importDirIntoStore = (
  dir: string,
  store: BundleableStaticStore,
  options?: { overwrite?: boolean },
): number => {
  const file = path.join(dir, STATIC_BUNDLE_FILE);
  if (!existsSync(file)) {
    return 0;
  }

  const parsed = JSON.parse(readFileSync(file, "utf8")) as StaticStoreBundle | undefined;
  if (!parsed || parsed.version !== 1 || !parsed.entries || typeof parsed.entries !== "object") {
    throw new Error(`invalid gen2e static store bundle at ${file}`);
  }

  const entries: BundleEntry[] = Object.entries(parsed.entries)
    .filter(([, content]) => content && typeof content === "object")
    .map(([key, content]) => ({ key, content }));

  return store.importEntries(entries, options);
};
