import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Gen2ELogger } from "@rhighs/gen2e-logger";
import sanitize, { type AllowedAttribute } from "sanitize-html";
import type { Page } from "./types";

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
    "a",
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
      "aria*",
      "data-testid",
      "data-*",
      "for",
      "textContent",
      "class",
    ],
    iframe: ["src"],
    frame: ["src"],
  },
  high: {
    "*": ["id", "placeholder", "data-testid", "textContent", "aria*"],
    iframe: ["src"],
    frame: ["src"],
  },
};

const sanitizeHtml = (
  subject: string,
  allowedTags: false | string[] | undefined,
  allowedAttributes: false | Record<string, sanitize.AllowedAttribute[]> | undefined,
  logger?: Gen2ELogger,
) => {
  if (logger) {
    logger.debug("sanitizing html, preserving data ", {
      allowedTags,
      allowedAttributes,
    });
  }

  const s = sanitize(subject, {
    allowedTags,
    allowedClasses: {
      "*": ["Mui*"],
    },
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
  /** Defaults to 2000ms, or `GEN2E_NETWORKIDLE_TIMEOUT_MS`. */
  networkIdleTimeoutMs?: number;
};

export type WebSnapshotResult = {
  dom: string;
  screenshot?: Buffer;
};

/** Any increase between two reads means a captured snapshot is stale. */
export type DomRevision = {
  navigations: number;
  mutations: number;
};

type PageRevisionState = {
  navigations: number;
};

const DEFAULT_NETWORK_IDLE_TIMEOUT_MS = 2000;

const resolveNetworkIdleTimeoutMs = (opts?: WebSnapshotOptions): number => {
  if (
    typeof opts?.networkIdleTimeoutMs === "number" &&
    Number.isFinite(opts.networkIdleTimeoutMs) &&
    opts.networkIdleTimeoutMs >= 0
  ) {
    return opts.networkIdleTimeoutMs;
  }

  const fromEnv = process.env.GEN2E_NETWORKIDLE_TIMEOUT_MS;
  if (fromEnv !== undefined && fromEnv.trim() !== "") {
    const parsed = Number.parseInt(fromEnv, 10);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return DEFAULT_NETWORK_IDLE_TIMEOUT_MS;
};

const isTimeoutError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") {
    return false;
  }
  const err = error as { name?: string; message?: string };
  return err.name === "TimeoutError" || /timeout .*exceeded/i.test(err.message ?? "");
};

// Kept off the page object so repeated installs stay idempotent.
const pageRevisions = new WeakMap<object, PageRevisionState>();

const MUTATION_COUNTER_INIT_SCRIPT = () => {
  const w = window as unknown as {
    __gen2eMutations?: number;
    __gen2eMutationObserver?: MutationObserver;
  };
  if (typeof w.__gen2eMutations !== "number") {
    w.__gen2eMutations = 0;
  }
  // The script also runs against already-open documents the init script may have seen; keep one observer.
  if (w.__gen2eMutationObserver) {
    return;
  }
  try {
    const observer = new MutationObserver(() => {
      w.__gen2eMutations = (w.__gen2eMutations ?? 0) + 1;
    });
    observer.observe(document, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
    w.__gen2eMutationObserver = observer;
  } catch (_err) {
    // init scripts run again on every navigation; a failed observe is not fatal
  }
};

type MutationCounterTarget = {
  evaluate?: (script: () => void) => Promise<unknown>;
};

const installMutationCounterInDocument = async (
  target: MutationCounterTarget | undefined,
): Promise<void> => {
  if (!target || typeof target.evaluate !== "function") {
    return;
  }

  try {
    await target.evaluate(MUTATION_COUNTER_INIT_SCRIPT);
  } catch (_err) {
    // cross-origin, detached or mock documents are not tracked
  }
};

// `addInitScript` only runs on navigation or frame attach, so documents already open need the counter injected directly.
const installMutationCountersInOpenDocuments = (page: Page): Promise<void> => {
  const targets: MutationCounterTarget[] = [];

  try {
    if (typeof (page as MutationCounterTarget | undefined)?.evaluate === "function") {
      targets.push(page as MutationCounterTarget);
    }
  } catch (_err) {
    // not a real page
  }

  try {
    if (typeof page?.frames === "function") {
      const frames = page.frames();
      if (Array.isArray(frames)) {
        for (const frame of frames) {
          if (frame && typeof frame.evaluate === "function") {
            targets.push(frame as MutationCounterTarget);
          }
        }
      }
    }
  } catch (_err) {
    // not a real page
  }

  return Promise.all(targets.map(installMutationCounterInDocument)).then(() => undefined);
};

export const installDomRevisionTracker = async (page: Page): Promise<void> => {
  try {
    if (!page || typeof page.on !== "function" || pageRevisions.has(page)) {
      return;
    }

    const state: PageRevisionState = { navigations: 0 };
    pageRevisions.set(page, state);

    page.on("framenavigated", () => {
      state.navigations += 1;
    });

    if (typeof page.addInitScript === "function") {
      try {
        // Awaited so a navigation right after the install cannot race the init script.
        await page.addInitScript(MUTATION_COUNTER_INIT_SCRIPT);
      } catch (_err) {
        // instrumentation must never fail the caller
      }
    }

    await installMutationCountersInOpenDocuments(page);
  } catch (_err) {
    // instrumentation must never fail the caller
  }
};

export const getDomRevision = async (page: Page): Promise<DomRevision> => {
  const navigations = pageRevisions.get(page as object)?.navigations ?? 0;
  let mutations = 0;

  try {
    const frames = typeof page?.frames === "function" ? page.frames() : [];
    if (Array.isArray(frames)) {
      for (const frame of frames) {
        if (!frame || typeof frame.evaluate !== "function") {
          continue;
        }
        try {
          const value = await frame.evaluate(() => {
            const w = window as unknown as { __gen2eMutations?: number };
            return w.__gen2eMutations ?? 0;
          });
          if (typeof value === "number" && Number.isFinite(value)) {
            mutations += value;
          }
        } catch (_err) {
          // cross-origin or detached frame: count as no mutations
        }
      }
    }
  } catch (_err) {
    // not a real page, report zeros
  }

  return { navigations, mutations };
};

// page.frames() includes the main frame, so this covers the page and every iframe.
const resolvePageContent = async (page: Page, logger?: Gen2ELogger): Promise<string> => {
  const contents: string[] = [];
  for (const f of page.frames()) {
    try {
      contents.push(await f.content());
    } catch (error) {
      logger?.debug("error trying to read frame content", { error });
    }
  }
  return contents.join("\n");
};

const OUTLINE_CSS = "* { border: 1px solid black !important; }";

const DATA_TAG_CSS = `
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
* { position: relative; }
body * { counter-reset: el-counter; }
body *::before {
  counter-increment: el-counter;
  content: attr(data-tag) " " counter(el-counter);
}`;

// Draws the debug styles for the screenshot and returns a function that takes them off the page again.
const decoratePage = async (
  page: Page,
  dataTags: string[] | undefined,
  logger?: Gen2ELogger,
): Promise<() => Promise<void>> => {
  const added: { remove: () => Promise<void> }[] = [];

  for (const f of page.frames()) {
    try {
      const outline = await f.addStyleTag({ content: OUTLINE_CSS });
      added.push({
        remove: () =>
          outline.evaluate((el) => {
            el.parentNode?.removeChild(el);
          }),
      });

      if (dataTags) {
        const meta = await f.addStyleTag({ content: DATA_TAG_CSS });
        added.push({
          remove: () =>
            meta.evaluate((el) => {
              el.parentNode?.removeChild(el);
            }),
        });
        await f.evaluate((tags) => {
          for (const el of document.querySelectorAll("*")) {
            if (tags.includes(el.tagName)) {
              el.setAttribute("data-tag", el.tagName.toLowerCase());
            }
          }
        }, dataTags);
        added.push({
          remove: () =>
            f.evaluate(() => {
              for (const el of document.querySelectorAll("[data-tag]")) {
                el.removeAttribute("data-tag");
              }
            }),
        });
      }
    } catch (error) {
      logger?.debug("could not decorate frame for the screenshot", { error });
    }
  }

  return async () => {
    for (const a of added.reverse()) {
      await a.remove().catch(() => undefined);
    }
  };
};

export const getSnapshot = async (
  page: Page,
  logger?: Gen2ELogger,
  opts?: WebSnapshotOptions,
): Promise<WebSnapshotResult> => {
  await page.waitForLoadState("domcontentloaded");
  const networkIdleTimeoutMs = resolveNetworkIdleTimeoutMs(opts);
  try {
    await page.waitForLoadState("networkidle", { timeout: networkIdleTimeoutMs });
  } catch (error) {
    if (!isTimeoutError(error)) {
      throw error;
    }
    if (logger) {
      logger.debug("network idle wait timed out, continuing with the current dom", {
        timeoutMs: networkIdleTimeoutMs,
      });
    }
  }

  const _tags = tags[opts?.stripLevel ?? "medium"];
  const _attrs = attributes[opts?.stripLevel ?? "medium"];

  const pageContent = await resolvePageContent(page, logger);
  const strippedPageContent = pageContent.replace(/[\t\r\n]/g, "");
  const content = sanitizeHtml(strippedPageContent, _tags, _attrs, logger).replace(/[\t\r\n]/g, "");
  if (logger) {
    logger.debug("captured snapshot", content);
  }

  const result: WebSnapshotResult = {
    dom: content,
  };

  if (opts?.screenshot) {
    const undecorate = opts.pageOutlines
      ? await decoratePage(
          page,
          opts.pageDataTags && Array.isArray(_tags) ? _tags : undefined,
          logger,
        )
      : async () => {};

    let buffer: Buffer;
    try {
      // JPEG is the only format whose size can be capped through `quality`.
      buffer = await page.screenshot({
        type: "jpeg",
        fullPage: opts.screenshotFullPage ?? false,
        quality: 20,
      });
    } finally {
      await undecorate();
    }

    if (opts.saveScreenShot) {
      const url = new URL(page.url());
      const filename = `${Date.now()}.jpeg`;
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
      logger?.debug("snapshot could not get any screenshot data, got empty or undefined buffer");
    }

    result.screenshot = buffer;
  }

  return result;
};
