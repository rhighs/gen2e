import type { MakeIdentFunction } from "./ident";
import type { StaticGenStep } from "./types";

/**
 * Context used to derive a versioned static cache identity. Changing any
 * normalized part (test title, task, page origin, prompt version or model)
 * changes the generated identifier.
 */
export type StaticKeyContext = {
  testTitle: string;
  task: string;
  pageUrl?: string;
  promptVersion?: string;
  model?: string;
};

export interface StaticStore {
  /**
   * Generates an identifier.
   */
  makeIdent: MakeIdentFunction;

  /**
   * Fetches a static generation step by its identifier.
   * @param {string} ident - The identifier.
   * @returns {StaticGenStep | undefined} The fetched static generation step, or undefined if not found.
   */
  fetchStatic: (ident: string) => StaticGenStep | undefined;

  /**
   * Writes some generated code in a store by ident key.
   * @param {string} ident - Code identifier the saved code will be associated with.
   * @param {string} content - Content to be saved.
   * @param {{ overwrite?: boolean }} [options] - Optional write options.
   */
  makeStatic: (ident: string, content: StaticGenStep, options?: { overwrite?: boolean }) => void;

  /**
   * Optional versioned identity derivation. When implemented it takes
   * precedence over `makeIdent` for cache reads and writes.
   */
  makeIdentFromContext?: (ctx: StaticKeyContext) => string;

  /**
   * Optional escape hatch to move a poisoned cache entry out of the store.
   */
  quarantine?: (ident: string, reason: string) => void;
}
