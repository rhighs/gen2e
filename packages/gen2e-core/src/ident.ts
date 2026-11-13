import { hash } from "crypto";
import type { StaticKeyContext } from "./store";

export type MakeIdentFunction = (testTitle: string, task: string) => string;

export const defaultMakeIdent: MakeIdentFunction = (testTitle: string, task: string) =>
  `gen2e.lib.static - [${testTitle}](${task})`;

export const hashBasedIdent: MakeIdentFunction = (testTitle: string, task: string) =>
  wrapIdent(defaultMakeIdent(testTitle, task));

export const wrapIdent = (ident: string): string => `${hash("md5", ident)}`;

const pageOrigin = (pageUrl?: string): string => {
  if (!pageUrl) {
    return "";
  }

  try {
    return new URL(pageUrl).origin;
  } catch {
    return pageUrl;
  }
};

export const defaultMakeIdentFromContext = (ctx: StaticKeyContext): string =>
  wrapIdent(
    JSON.stringify({
      testTitle: ctx.testTitle ?? "",
      task: ctx.task ?? "",
      pageOrigin: pageOrigin(ctx.pageUrl),
      promptVersion: ctx.promptVersion ?? "",
      model: ctx.model ?? "",
    }),
  );
