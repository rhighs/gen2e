import { StaticGenStep } from "../../types";
import { MakeIdentFunction } from "../ident";

export interface StaticStore {
  makeIdent: MakeIdentFunction
  fetchStatic: (ident: string) => StaticGenStep | undefined;
  makeStatic: (content: StaticGenStep) => void;
}