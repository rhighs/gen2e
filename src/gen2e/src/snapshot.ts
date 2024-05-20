import sanitize from "sanitize-html";

import { Page } from "./types";

const sanitizeHtml = (subject: string) => {
  return sanitize(subject, {
    // The default allowedTags list already includes _a lot_ of commonly used tags.
    // https://www.npmjs.com/package/sanitize-html#default-options
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
        "data-*",
        "for",
        "textContent",
        "innerText",
        "tagName",
        "index",
      ],
    },
    nonBooleanAttributes: ["*"],
  });
};

export const getSnapshot = async (page: Page) => {
  const content = sanitizeHtml(await page.content());
  return {
    dom: content,
  };
};
