import { hash } from "crypto";
import type { StaticKeyContext } from "./store";

/**
 * Type definition for a function that generates an identifier.
 * @param {string} testTitle - The title of the test.
 * @param {string} task - The task description.
 * @returns {string} The generated identifier.
 */
export type MakeIdentFunction = (testTitle: string, task: string) => string;

/**
 * Default implementation of the MakeIdentFunction.
 * Generates an identifier in the format: `gen2e.lib.static - [testTitle](task)`.
 * @param {string} testTitle - The title of the test.
 * @param {string} task - The task description.
 * @returns {string} The generated identifier.
 */
export const defaultMakeIdent: MakeIdentFunction = (testTitle: string, task: string) =>
  `gen2e.lib.static - [${testTitle}](${task})`;

/**
 * Hash-based implementation of the MakeIdentFunction.
 * Generates the MD5 hash of the default identifier.
 * @param {string} testTitle - The title of the test.
 * @param {string} task - The task description.
 * @returns {string} The generated identifier.
 */
export const hashBasedIdent: MakeIdentFunction = (testTitle: string, task: string) =>
  wrapIdent(defaultMakeIdent(testTitle, task));

/**
 * Wraps an identifier with an MD5 hash.
 * @param {string} ident - The identifier.
 * @returns {string} The wrapped identifier.
 */
export const wrapIdent = (ident: string): string => `${hash("md5", ident)}`;

/**
 * Extracts the origin of a page URL, falling back to the raw value when the
 * URL cannot be parsed.
 * @param {string} [pageUrl] - The page URL.
 * @returns {string} The page origin or the raw page URL.
 */
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

/**
 * Versioned identifier derived from a static key context. Identical inputs
 * always produce the same identifier; changing the model, prompt version or
 * page origin produces a different one.
 * @param {StaticKeyContext} ctx - The cache key context.
 * @returns {string} The generated identifier.
 */
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
