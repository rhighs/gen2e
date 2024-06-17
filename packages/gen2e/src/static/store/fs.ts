import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "fs";
import { StaticGenStep } from "../../types";
import { StaticStore } from "./store";
import path from "path";
import { defaultMakeIdent, wrapIdent } from "../ident";
import { BASE_STATIC_PATH } from "..";

const shouldPreload = !!process.env.GEN2E_PRELOAD_ENABLED;
const stepsDirPath = `${BASE_STATIC_PATH}/steps`;

/**
 * Constructs the file path for a given identifier.
 * @param {string} ident - The identifier.
 * @returns {string} The constructed file path.
 */
const stepFilePath = (ident: string): string =>
  `${BASE_STATIC_PATH}/steps/${wrapIdent(ident)}.gen.step`;

type PreloadedStaticSteps = Map<string, StaticGenStep>;

/**
 * Preloads the static steps from the steps directory.
 * @returns {PreloadedStaticSteps} A map of preloaded static steps.
 */
export const preload = (): PreloadedStaticSteps =>
  readdirSync(stepsDirPath).reduce((acc, file): PreloadedStaticSteps => {
    const fileContents = readFileSync(path.join(stepsDirPath, file)).toString();
    acc.set(file, JSON.parse(fileContents));
    return acc;
  }, new Map());

let preloadedSteps = new Map();
if (shouldPreload) {
  preloadedSteps = preload();
}

/**
 * File system-based implementation of the StaticStore interface.
 */
export const FSStaticStore: StaticStore = {
  makeIdent: defaultMakeIdent,

  /**
   * Fetches a static generation step by its identifier.
   */
  fetchStatic: (ident): StaticGenStep | undefined => {
    if (!existsSync(stepsDirPath)) {
      mkdirSync(stepsDirPath, { recursive: true });
    }

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
    } catch (err) {
      return undefined;
    }
  },

  /**
   * Writes a static generation step to the file system.
   */
  makeStatic: (ident: string, content: StaticGenStep) => {
    if (!existsSync(stepsDirPath)) {
      mkdirSync(stepsDirPath, { recursive: true });
    }

    return writeFileSync(stepFilePath(ident), JSON.stringify(content), {
      flag: "wx",
    });
  },
};
