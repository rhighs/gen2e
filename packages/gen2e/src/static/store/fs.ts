import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "fs";
import { StaticGenStep } from "../../types";
import { StaticStore } from "./store";
import { hash } from "crypto";
import path from "path";
import { defaultMakeIdent } from "../ident";

const shouldPreload = !!process.env.GEN2E_PRELOAD_ENABLED;
const BASE_STATIC_PATH =
  process.env.GEN2E_STATIC_PATH ?? path.join(process.cwd(), ".static");
const stepsDirPath = `${BASE_STATIC_PATH}/steps`;

/**
 * Constructs the file path for a given identifier.
 * @param {string} ident - The identifier.
 * @returns {string} The constructed file path.
 */
const stepFilePath = (ident: string): string =>
  `${BASE_STATIC_PATH}/steps/${wrapIdent(ident)}`;

type PreloadedStaticSteps = Map<string, string>;

/**
 * Preloads the static steps from the steps directory.
 * @returns {PreloadedStaticSteps} A map of preloaded static steps.
 */
export const preload = (): PreloadedStaticSteps =>
  readdirSync(stepsDirPath).reduce((acc, file): PreloadedStaticSteps => {
    acc.set(file, readFileSync(path.join(stepsDirPath, file)).toString());
    return acc;
  }, new Map());

let preloadedSteps = new Map();
if (shouldPreload) {
  preloadedSteps = preload();
}

/**
 * Wraps an identifier with an MD5 hash.
 * @param {string} ident - The identifier.
 * @returns {string} The wrapped identifier.
 */
const wrapIdent = (ident: string): string => `${hash("md5", ident)}.gen.step`;

/**
 * File system-based implementation of the StaticStore interface.
 */
export const FSStaticStore: StaticStore = {
  makeIdent: defaultMakeIdent,

  /**
   * Fetches a static generation step by its identifier.
   * @param {string} ident - The identifier.
   * @returns {StaticGenStep | undefined} The fetched static generation step, or undefined if not found.
   */
  fetchStatic: (ident): StaticGenStep | undefined => {
    if (!existsSync(stepsDirPath)) {
      mkdirSync(stepsDirPath, { recursive: true });
    }

    if (shouldPreload) {
      const maybeStatic = preloadedSteps.get(wrapIdent(ident));
      if (maybeStatic) {
        return {
          ident,
          expression: maybeStatic,
        };
      }
    }

    try {
      return {
        ident,
        expression: readFileSync(stepFilePath(ident)).toString(),
      };
    } catch (err) {
      return undefined;
    }
  },

  /**
   * Writes a static generation step to the file system.
   * @param {StaticGenStep} staticInfo - The static generation step information.
   */
  makeStatic: (staticInfo: StaticGenStep) => {
    return writeFileSync(
      stepFilePath(staticInfo.ident),
      staticInfo.expression,
      {
        flag: "wx",
      }
    );
  },
};
