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

export type WebSnapshotOptions = {
  screenshot?: boolean;
  debug?: boolean;
};

export type WebSnapshotResult = {
  dom: string;
  screenshot?: Buffer;
};

export const getSnapshot = async (
  page: Page,
  logger?: Gen2ELogger,
  opts?: WebSnapshotOptions
): Promise<WebSnapshotResult> => {
  // rob: prevent snapshotting the wrong page
  {
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("networkidle");
  }

  const content = sanitizeHtml(await page.content());
  if (logger) {
    logger.debug("captured snapshot", content);
  }

  const result: WebSnapshotResult = {
    dom: content,
  };

  if (opts?.screenshot) {
    const buffer = await page.screenshot({
      type: "png",
      fullPage: true,
    });

    if ((!buffer || buffer.length === 0) && opts.debug) {
      logger?.debug(
        "snapshot could not get any screenshot data, got empty or undefined buffer"
      );
    }

    result.screenshot = buffer;
  }

  return result;
};
