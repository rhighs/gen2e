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
  /**
   * Upper bound for the network-idle wait. Defaults to 2000ms and can be
   * overridden through `GEN2E_NETWORKIDLE_TIMEOUT_MS`.
   */
  networkIdleTimeoutMs?: number;
};

export type WebSnapshotResult = {
  dom: string;
  screenshot?: Buffer;
};

/**
 * Node-side counters describing how much a page moved. Any increase between
 * two reads means the DOM moved (navigation or mutation) and a previously
 * captured snapshot can no longer be trusted.
 */
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

/**
 * Module-level revision counters keyed by page. Kept off the page object so
 * repeated installs stay idempotent.
 */
const pageRevisions = new WeakMap<object, PageRevisionState>();

const MUTATION_COUNTER_INIT_SCRIPT = () => {
  const w = window as unknown as {
    __gen2eMutations?: number;
    __gen2eMutationObserver?: MutationObserver;
  };
  if (typeof w.__gen2eMutations !== "number") {
    w.__gen2eMutations = 0;
  }
  // The script is also run directly against already-open documents, where the
  // init-script pass may have observed this document too; keep one observer.
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

/**
 * Runs the mutation counter against every document that is already open.
 * `addInitScript` only evaluates on navigation or frame attach, so an install
 * performed after the caller navigated would otherwise leave the current
 * document without a MutationObserver.
 */
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

/**
 * Installs the DOM revision tracker for a page: a `framenavigated` listener
 * for every frame and a page-side MutationObserver counting changes in
 * `window.__gen2eMutations`. The observer is installed both for future
 * navigations (init script) and for the documents that are already open, so an
 * install that happens after `page.goto` still tracks the current document.
 * Idempotent per page and tolerant of mocks that do not implement the
 * Playwright page API. Resolves once the open documents have been instrumented.
 */
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
        // Await the registration so a navigation that follows the install
        // cannot race ahead of the init script.
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

/**
 * Reads the current DOM revision for a page. Mutations are summed across
 * every frame; cross-origin or detached frames count as zero. Never throws:
 * pages that are not real Playwright pages report zeros.
 */
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

const resolveHTMLRoot = async (page: Page): Promise<string> => {
  const element: Element | null = await page.evaluate(() => {
    const x = window.innerWidth / 2;
    const y = window.innerHeight / 2;
    let element = document.elementFromPoint(x, y);
    while (element?.parentElement && element.parentElement.tagName.toLowerCase() !== "body")
      element = element.parentElement;
    return element;
  });
  if (!element) {
    return "";
  }
  return element.outerHTML;
};

const resolvePageContent = async (page: Page, logger?: Gen2ELogger): Promise<string> => {
  let mainPageContent = await page.content();
  if (mainPageContent.includes("<body")) {
    const contextRoot = await resolveHTMLRoot(page);
    if (contextRoot !== "") {
      mainPageContent = contextRoot;
    }
  }

  const frames = page.frames();
  const framesContent: string[] = [];
  for (const f of frames) {
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
  return pageContent;
};

const outlinePage = async (page: Page): Promise<void> => {
  const frames = page.frames();
  const outline = {
    content: `
  * {
    border: 1px solid black !important;
  }
  `,
  };

  for (const p of [...frames, page]) {
    await p.addStyleTag(outline);
  }
};

const debugPageElementsTag = async (page: Page, tags: string[]): Promise<void> => {
  const frames = page.frames();
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

  for (const p of [...frames, page]) {
    await p.addStyleTag(metaTagName);
    await p.evaluate(
      (tags) =>
        document.querySelectorAll("*").forEach((el) => {
          if (Array.isArray(tags)) {
            if (tags.includes(el.tagName)) {
              el.setAttribute("data-tag", el.tagName.toLowerCase());
            }
          }
        }),
      tags,
    );
  }
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
    // rob:
    // outline every element in the page, this will help better recognising
    // which element fall into a specific html tree branch.
    // html tags are also added if specifically asked to via opts, this will show
    // a floating text at the left-top corner of each element saying what kind of html tag
    // the outlined element is.
    if (opts.pageOutlines) {
      await outlinePage(page);
      if (opts.pageDataTags && Array.isArray(_tags)) {
        await debugPageElementsTag(page, _tags);
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
