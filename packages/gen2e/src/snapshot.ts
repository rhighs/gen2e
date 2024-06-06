import sanitize, { AllowedAttribute } from "sanitize-html";

import { Page } from "./types";
import { Gen2ELogger } from "@rhighs/gen2e-logger";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const tags: { [key: string]: false | string[] } = {
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
  [key: string]: false | Record<string, AllowedAttribute[]>;
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

const sanitizeHtml = (
  subject: string,
  allowedTags: false | string[] | undefined,
  allowedAttributes:
    | false
    | Record<string, sanitize.AllowedAttribute[]>
    | undefined,
  logger?: Gen2ELogger
) => {
  if (logger) {
    logger.debug("sanitizing html, preserving data ", {
      allowedTags,
      allowedAttributes,
    });
  }

  const s = sanitize(subject, {
    allowedTags,
    allowedAttributes,
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
  saveScreenShot?: boolean;
  pageOutlines?: boolean;
  pageDataTags?: boolean;
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

  const _tags = tags[opts?.stripLevel ?? "medium"];
  const _attrs = attributes[opts?.stripLevel ?? "medium"];

  const pageContent = mainPageContent + framesContent.join("\n");
  const strippedPageContent = pageContent.replace(/[\t\r\n]/g, "");
  const content = sanitizeHtml(
    strippedPageContent,
    _tags,
    _attrs,
    logger
  ).replace(/[\t\r\n]/g, "");
  if (logger) {
    logger.debug("captured snapshot", content);
  }

  const result: WebSnapshotResult = {
    dom: content,
  };

  if (opts?.screenshot) {
    // rob:
    // outline every element in the page, this will help better recognising
    // which element fall into a specific html tree branch.
    // html tags are also added if specifically asked to via opts, this will show
    // a floating text at the left-top corner of each element saying what kind of html tag
    // the outlined element is.
    if (opts.pageOutlines) {
      const outline = {
        content: `
      * {
        border: 1px solid black !important;
      }
      `,
      };
      if (opts.pageDataTags) {
        const metaTagName = {
          content: `
          *::before {
              content: attr(data-tag);
              display: block;
              position: absolute;
              top: 0;
              left: 0;
              color: red;
              font-size: 12px;
              border: 1px solid black;
              padding: 2px;
              z-index: 9999;
          }

          * {
            position: relative;
          }

          body * {
              counter-reset: el-counter;
          }

          body *::before {
              counter-increment: el-counter;
              content: attr(data-tag) " " counter(el-counter);
          }
      `,
        };

        for (let p of [...frames, page]) {
          await p.addStyleTag(metaTagName);
          await p.evaluate(
            (_tags) =>
              document.querySelectorAll("*").forEach((el) => {
                if (Array.isArray(_tags)) {
                  if (_tags.includes(el.tagName)) {
                    el.setAttribute("data-tag", el.tagName.toLowerCase());
                  }
                }
              }),
            _tags
          );
        }
      }

      for (let p of [...frames, page]) {
        await p.addStyleTag(outline);
      }
    }

    // rob:
    // this is fixed due to jpeg being the only way to control output image size via `quality` param.
    const buffer = await page.screenshot({
      type: "jpeg",
      fullPage: opts.screenshotFullPage ?? false,
      quality: 20,
    });

    if (opts.saveScreenShot) {
      const url = new URL(page.url());
      const filename = `${+new Date()}.jpeg`;
      const dir = path.join(os.tmpdir(), `gen2e-snapshots`, url.hostname);
      fs.mkdirSync(dir, {
        recursive: true,
      });
      const filepath = path.join(dir, filename);
      fs.writeFileSync(filepath, buffer, {
        flag: "wx",
      });
      if (logger) {
        logger.info(`dom screenshot captured`, { filepath });
      }
    }

    if ((!buffer || buffer.length === 0) && opts.debug) {
      logger?.debug(
        "snapshot could not get any screenshot data, got empty or undefined buffer"
      );
    }

    result.screenshot = buffer;
  }

  return result;
};
