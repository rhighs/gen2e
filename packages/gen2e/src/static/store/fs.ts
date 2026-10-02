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
import { makeLogger } from "@rhighs/gen2e-logger";
import path from "path";
import type { StaticGenStep } from "../../types";
import { staticBasePath } from "..";
import { defaultMakeIdent, defaultMakeIdentFromContext, wrapIdent } from "../ident";
import type { StaticStore } from "./store";

const storeLogger = makeLogger("GEN2E-STATIC-STORE");

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
 * File system-based implementation of the StaticStore interface.
 */
export const FSStaticStore: StaticStore = {
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
   * first-writer-wins unless `options.overwrite` is set.
   */
  makeStatic: (ident: string, content: StaticGenStep, options?: { overwrite?: boolean }) => {
    const dir = stepsDirPath();
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const target = stepFilePath(ident);
    const tmpPath = `${target}.tmp-${process.pid}-${++tmpFileCounter}`;

    try {
      writeFileSync(tmpPath, JSON.stringify(content));

      if (options?.overwrite) {
        renameSync(tmpPath, target);
        return;
      }

      try {
        linkSync(tmpPath, target);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "EEXIST") {
          storeLogger.debug("static entry already exists, keeping first writer", {
            ident,
            target,
          });
          return;
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
  },

  /**
   * Moves a static entry out of the steps directory into the quarantine
   * directory, stamped with the current epoch.
   */
  quarantine: (ident: string, reason: string) => {
    const target = stepFilePath(ident);
    if (!existsSync(target)) {
      storeLogger.debug("quarantine requested for a missing static entry", { ident, reason });
      return;
    }

    const dir = quarantineDirPath();
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const file = path.join(dir, `${wrapIdent(ident)}.${Date.now()}.gen.step`);
    renameSync(target, file);
    preloadedSteps.delete(`${wrapIdent(ident)}.gen.step`);
    storeLogger.debug("quarantined static entry", { ident, reason, file });
  },
};
