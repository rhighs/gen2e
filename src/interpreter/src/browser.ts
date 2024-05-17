import {
  Browser,
  BrowserContext,
  BrowserType,
  Page,
  chromium,
  firefox,
} from "@playwright/test";

import { info } from "./log";

export type Gen2EBrowserOptions = {
  browser?: "chromium" | "firefox";
  headless?: boolean;
  verbose?: boolean;
};

export class Gen2EBrowser {
  options: Gen2EBrowserOptions = {};

  browser: Browser | undefined;
  context: BrowserContext | undefined;
  page: Page | undefined;

  constructor(options?: Gen2EBrowserOptions) {
    if (options) {
      this.options = options;
    }
  }

  async startup() {
    let b: BrowserType | undefined = undefined;
    const browser = this.options.browser ?? "chromium";
    if (this.options.verbose) {
      info(`Starting browser ${browser}...`);
    }

    try {
      switch (browser) {
        case "firefox":
          b = firefox;
          break;
        case "chromium":
        default:
          b = chromium;
      }

      this.browser = await b.launch({
        headless: this.options.headless ?? false,
        args: ["--ignore-certificate-errors"],
      });
      this.context = await this.browser.newContext();
      this.page = await this.context.newPage();
    } catch (err) {
      err("Failed stating browser, got error", err);
      throw err;
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}
