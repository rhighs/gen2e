import type { MakeIdentFunction } from "./ident";
import type { StaticGenStep } from "./types";

export type StaticKeyContext = {
  testTitle: string;
  task: string;
  pageUrl?: string;
  promptVersion?: string;
  model?: string;
};

export interface StaticStore {
  makeIdent: MakeIdentFunction;

  fetchStatic: (ident: string) => StaticGenStep | undefined;

  makeStatic: (ident: string, content: StaticGenStep, options?: { overwrite?: boolean }) => void;

  /** Takes precedence over `makeIdent` when implemented. */
  makeIdentFromContext?: (ctx: StaticKeyContext) => string;

  quarantine?: (ident: string, reason: string) => void;
}
