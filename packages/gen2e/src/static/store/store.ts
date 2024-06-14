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
   * Writes some generated code in a store by ident key.
   * @param {string} ident - Code identifier the saved code will be associated with.
   * @param {string} code - Code to be saved.
   */
  makeStatic: (ident: string, content: StaticGenStep) => void;
}
