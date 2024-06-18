import { API, FileInfo } from "jscodeshift";
import { makeTransformer } from "./compiler";
import { Gen2ELogger } from "@rhighs/gen2e-logger";
import { namedTypes as n } from "ast-types";

export type Gen2EPageObjectInfo = {
  className: string;
  pageUrl: string;
  description: string;
};

/**
 * Extracts page object information from a source string.
 *
 * This function compiles a JavaScript source string and extracts information
 * about classes, specifically those with properties `gen2e_const_pageUrl`
 * and `gen2e_const_description`. The extracted information includes the class name,
 * page URL, and description.
 *
 * @param {string} source - The JavaScript source code as a string.
 * @returns {Gen2EPageObjectInfo[]} List of page object info tags values found.
 */
export const pageObjectsInfo = (source: string): Gen2EPageObjectInfo[] =>
  makeTransformer((fileInfo: FileInfo, api: API, logger?: Gen2ELogger) => {
    const j = api.jscodeshift;
    const root = j(fileInfo.source);
    const result: Gen2EPageObjectInfo[] = [];

    root.find(j.ClassDeclaration).forEach((path) => {
      const className = path!.node!.id!.name;
      let pageUrl = "";
      let description = "";

      path.node.body.body.forEach((member) => {
        if (n.ClassProperty.check(member) && member.key.type === "Identifier") {
          if (
            member.key.name === "gen2e_const_pageUrl" &&
            n.Literal.check(member.value) &&
            typeof member.value.value === "string"
          ) {
            pageUrl = member.value.value;
          }

          if (
            member.key.name === "gen2e_const_description" &&
            n.Literal.check(member.value) &&
            typeof member.value.value === "string"
          ) {
            description = member.value.value;
          }
        }
      });

      if (className || pageUrl || description) {
        result.push({
          className: className ?? "",
          pageUrl: pageUrl ?? "",
          description: description ?? "",
        });
      }
    });

    return result;
  })(source);
