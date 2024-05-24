import sanitize from "sanitize-html";

import { Page } from "./types";

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

export const getSnapshot = async (page: Page) => {
  await page.waitForTimeout(1000);
  const content = sanitizeHtml(await page.content());
  return {
    dom: content,
  };
};
