import { StaticGenStep } from "./types";
import path from "path";
import {
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from "fs";

const shouldPreload = !!process.env.GEN2E_PRELOAD_ENABLED;
const BASE_STATIC_PATH = process.env.GEN2E_STATIC_PATH ?? ".static";
const stepsDirPath = `${BASE_STATIC_PATH}/steps`;

const wrapIdent = (ident: string) => `${ident.replaceAll(" ", "_")}.gen.step`;
const stepFilePath = (ident: string) =>
  `${BASE_STATIC_PATH}/steps/${wrapIdent(ident)}`;

type PreloadedStaticSteps = Map<string, string>;
const preload = (): PreloadedStaticSteps =>
  readdirSync(stepsDirPath).reduce((acc, file): PreloadedStaticSteps => {
    acc.set(file, readFileSync(path.join(stepsDirPath, file)).toString());
    return acc;
  }, new Map());

let preloadedSteps = new Map();
if (shouldPreload) {
  preloadedSteps = preload();
}

export const makeStatic = (staticInfo: StaticGenStep) =>
  writeFileSync(stepFilePath(staticInfo.ident), staticInfo.expression);

export const fetchStatic = (ident: string): StaticGenStep | undefined => {
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
};
