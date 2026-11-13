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

const stepFilePath = (ident: string): string => `${stepsDirPath()}/${wrapIdent(ident)}.gen.step`;

type PreloadedStaticSteps = Map<string, StaticGenStep>;

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

// Returns false when the target exists and `overwrite` is off: the first writer wins.
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

export const FSStaticStore: BundleableStaticStore = {
  makeIdent: defaultMakeIdent,
  makeIdentFromContext: defaultMakeIdentFromContext,

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

  // A successful write refreshes the preload map so an overwritten entry heals in this process.
  makeStatic: (ident: string, content: StaticGenStep, options?: { overwrite?: boolean }) => {
    if (writeStepFile(stepFilePath(ident), content, !!options?.overwrite) && shouldPreload) {
      preloadedSteps.set(`${wrapIdent(ident)}.gen.step`, content);
    }
  },

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

  // `key` is the file name without the `.gen.step` suffix.
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
