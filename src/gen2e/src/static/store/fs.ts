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

const wrapIdent = (ident: string) => `${hash("md5", ident)}.gen.step`;

export const FSStaticStore: StaticStore = {
  makeIdent: defaultMakeIdent,
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
