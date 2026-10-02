import {
  existsSync,
  linkSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  defaultMakeIdent,
  defaultMakeIdentFromContext,
  type StaticGenStep,
  wrapIdent,
} from "@rhighs/gen2e-core";
import type { BundleableStaticStore, BundleEntry } from "./bundle";
import { staticBasePath } from "./paths";

const shouldPreload = !!process.env.GEN2E_PRELOAD_ENABLED;
const stepsDirPath = (): string => `${staticBasePath()}/steps`;
const quarantineDirPath = (): string => `${staticBasePath()}/quarantine`;

/**
 * Constructs the file path for a given identifier.
 * @param {string} ident - The identifier.
 * @returns {string} The constructed file path.
 */
const stepFilePath = (ident: string): string => `${stepsDirPath()}/${wrapIdent(ident)}.gen.step`;

type PreloadedStaticSteps = Map<string, StaticGenStep>;

/**
 * Preloads the static steps from the steps directory.
 * @returns {PreloadedStaticSteps} A map of preloaded static steps.
 */
export const preload = (): PreloadedStaticSteps =>
  readdirSync(stepsDirPath()).reduce((acc, file): PreloadedStaticSteps => {
    const fileContents = readFileSync(path.join(stepsDirPath(), file)).toString();
    acc.set(file, JSON.parse(fileContents));
    return acc;
  }, new Map());

let preloadedSteps = new Map();
if (shouldPreload) {
  preloadedSteps = preload();
}

let tmpFileCounter = 0;

/**
 * Writes one step file atomically. Returns false when the target already
 * exists and `overwrite` is off (first writer wins).
 */
const writeStepFile = (target: string, content: StaticGenStep, overwrite: boolean): boolean => {
  const dir = path.dirname(target);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const tmpPath = `${target}.tmp-${process.pid}-${++tmpFileCounter}`;

  try {
    writeFileSync(tmpPath, JSON.stringify(content));

    if (overwrite) {
      renameSync(tmpPath, target);
      return true;
    }

    try {
      linkSync(tmpPath, target);
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "EEXIST") {
        return false;
      }
      throw err;
    }
  } finally {
    try {
      unlinkSync(tmpPath);
    } catch (_err) {
      // tmp was already renamed away or never created
    }
  }
};

/**
 * File system-based implementation of the StaticStore interface.
 */
export const FSStaticStore: BundleableStaticStore = {
  makeIdent: defaultMakeIdent,
  makeIdentFromContext: defaultMakeIdentFromContext,

  /**
   * Fetches a static generation step by its identifier.
   */
  fetchStatic: (ident): StaticGenStep | undefined => {
    if (shouldPreload) {
      const maybeStatic = preloadedSteps.get(wrapIdent(ident) + ".gen.step");
      if (maybeStatic) {
        return maybeStatic;
      }
    }

    try {
      const fileContents = readFileSync(stepFilePath(ident)).toString();
      const content = JSON.parse(fileContents);
      if (!content.expression) {
        return undefined;
      }

      return {
        ...content,
        expression: content.expression,
      };
    } catch (_err) {
      return undefined;
    }
  },

  /**
   * Writes a static generation step to the file system. Writes are atomic and
   * first-writer-wins unless `options.overwrite` is set. Successful writes
   * refresh the preload map so an overwritten entry heals in the same process.
   */
  makeStatic: (ident: string, content: StaticGenStep, options?: { overwrite?: boolean }) => {
    if (writeStepFile(stepFilePath(ident), content, !!options?.overwrite) && shouldPreload) {
      preloadedSteps.set(`${wrapIdent(ident)}.gen.step`, content);
    }
  },

  /**
   * Moves a static entry out of the steps directory into the quarantine
   * directory, stamped with the current epoch.
   */
  quarantine: (ident: string, _reason: string) => {
    const target = stepFilePath(ident);
    if (!existsSync(target)) {
      return;
    }

    const dir = quarantineDirPath();
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const file = path.join(dir, `${wrapIdent(ident)}.${Date.now()}.gen.step`);
    renameSync(target, file);
    preloadedSteps.delete(`${wrapIdent(ident)}.gen.step`);
  },

  /**
   * Lists every parseable entry as a raw `{ key, content }` pair, where `key`
   * is the wrapped file key (the file name without the `.gen.step` suffix).
   */
  exportEntries: (): BundleEntry[] => {
    const dir = stepsDirPath();
    let files: string[];
    try {
      files = readdirSync(dir).filter((file) => file.endsWith(".gen.step"));
    } catch (_err) {
      return [];
    }

    const entries: BundleEntry[] = [];
    for (const file of files) {
      try {
        const content = JSON.parse(readFileSync(path.join(dir, file)).toString());
        if (content && typeof content === "object" && typeof content.expression === "string") {
          entries.push({ key: file.slice(0, -".gen.step".length), content });
        }
      } catch (_err) {
        // malformed entries are not exportable
      }
    }
    return entries;
  },

  /**
   * Writes raw entries back into the steps directory. Keys are wrapped file
   * keys as returned by `exportEntries`. Imported entries refresh the preload
   * map when preloading is enabled.
   */
  importEntries: (entries: BundleEntry[], options?: { overwrite?: boolean }): number => {
    let imported = 0;
    for (const { key, content } of entries) {
      if (!key || !content || typeof content !== "object") {
        continue;
      }
      if (writeStepFile(`${stepsDirPath()}/${key}.gen.step`, content, !!options?.overwrite)) {
        imported++;
        if (shouldPreload) {
          preloadedSteps.set(`${key}.gen.step`, content);
        }
      }
    }
    return imported;
  },
};
