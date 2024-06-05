import sanitize, { AllowedAttribute } from "sanitize-html";

import { Page } from "./types";
import { Gen2ELogger } from "@rhighs/gen2e-logger";

const sanitizeHtml = (
  subject: string,
  stripLevel: "high" | "medium" | "none" = "medium",
  logger?: Gen2ELogger
) => {
  const tags: { [key: string]: false | string[] | undefined } = {
    none: false,
    medium: sanitize.defaults.allowedTags.concat([
      "html",
      "body",
      "option",
      "button",
      "form",
      "frameset",
      "img",
      "input",
      "iframe",
      "frame",
      "select",
      "textarea",
      "table",
      "caption",
      "font",
      "b",
      "tbody",
      "tr",
      "td",
      "font",
      "a",
      "b",
      "td",
      "font",
      "tr",
      "td",
      "font",
      "a",
      "b",
      "td",
      "font",
      "tr",
      "td",
      "font",
      "a",
      "b",
      "td",
      "font",
      "tr",
    ]),
    high: [
      "html",
      "header",
      "frameset",
      "iframe",
      "section",
      "body",
      "div",
      "input",
      "button",
      "form",
    ],
  };
  const attributes: {
    [key: string]: false | Record<string, AllowedAttribute[]> | undefined;
  } = {
    none: false,
    medium: {
      "*": [
        "alt",
        "contenteditable",
        "form",
        "id",
        "label",
        "src",
        "value",
        "name",
        "placeholder",
        "type",
        "href",
        "role",
        "title",
        "aria-label",
        "aria-labelledby",
        "data-testid",
        "data-*",
        "for",
        "textContent",
      ],
      iframe: ["src"],
      frame: ["src"],
    },
    high: {
      "*": ["id", "placeholder", "data-testid", "textContent"],
      iframe: ["src"],
      frame: ["src"],
    },
  };

  if (logger) {
    logger.debug("sanitizing html, preserving data ", { tags, attributes });
  }

  const s = sanitize(subject, {
    allowedTags: tags[stripLevel],
    allowedAttributes: attributes[stripLevel],
  });

  if (logger) {
    const p = Math.floor(((subject.length - s.length) / subject.length) * 100);
    logger.debug(`html shrinked by ${p}%`, {
      orig: subject.length,
      sanitized: s.length,
    });
  }

  return s;
};

export type WebSnapshotOptions = {
  stripLevel?: "high" | "medium" | "none";
  screenshot?: boolean;
  screenshotFullPage?: boolean;
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

  const mainPageContent = await page.content();
  const frames = page.frames();
  const framesContent: string[] = [];
  for (let f of frames) {
    try {
      const frameContent = await f.content();
      framesContent.push(frameContent);
    } catch (error) {
      if (logger) {
        logger.debug("error trying to read frame content", { error });
      }
    }
  }

  const pageContent = mainPageContent + framesContent.join("\n");
  const strippedPageContent = pageContent.replace(/[\t\r\n]/g, "");
  const content = sanitizeHtml(
    strippedPageContent,
    opts?.stripLevel,
    logger
  ).replace(/[\t\r\n]/g, "");
  if (logger) {
    logger.debug("captured snapshot", content);
  }

  const result: WebSnapshotResult = {
    dom: content,
  };

  if (opts?.screenshot) {
    const buffer = await page.screenshot({
      type: "jpeg",
      fullPage: opts.screenshotFullPage ?? false,
      quality: 20,
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
