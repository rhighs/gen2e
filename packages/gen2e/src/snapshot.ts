import sanitize from "sanitize-html";

import { Page } from "./types";
import { Gen2ELogger } from "@rhighs/gen2e-logger";

const sanitizeHtml = (subject: string) => {
  return sanitize(subject, {
    allowedTags: sanitize.defaults.allowedTags.concat([
      "button",
      "form",
      "img",
      "input",
      "select",
      "textarea",
    ]),
    allowedAttributes: {
      "*": [
        "id",
        "class",
        "name",
        "placeholder",
        "type",
        "value",
        "href",
        "src",
        "alt",
        "role",
        "title",
        "aria-label",
        "aria-labelledby",
        "data-testid",
        "data-*",
        "for",
        "textContent",
        "innerText",
        "tagName",
        "index",
      ],
    },
  });
};

export const getSnapshot = async (page: Page, logger?: Gen2ELogger) => {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle");
  const content = sanitizeHtml(await page.content());
  if (logger) {
    logger.debug("captured snapshot", content);
  }
  return {
    dom: content,
  };
};
