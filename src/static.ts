import { StaticGenStep } from "./types";
import { readFileSync, writeFileSync } from "fs";

const wrapIdent = (ident: string) => `${ident.replaceAll(" ", "_")}.gen.step`;

export const makeStatic = (staticInfo: StaticGenStep) =>
  writeFileSync(
    `src/static/steps/${wrapIdent(staticInfo.ident)}`,
    staticInfo.expression
  );

export const fetchStatic = (ident: string): StaticGenStep | undefined => {
  try {
    return {
      ident,
      expression: readFileSync(
        `src/static/steps/${wrapIdent(ident)}`
      ).toString(),
    };
  } catch (err) {
    return undefined;
  }
};
