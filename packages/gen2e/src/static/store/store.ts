import { StaticGenStep } from "../../types";
import { MakeIdentFunction } from "../ident";

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
   * Writes a static generation step to the store.
   * @param {StaticGenStep} content - The static generation step content.
   */
  makeStatic: (content: StaticGenStep) => void;
}
