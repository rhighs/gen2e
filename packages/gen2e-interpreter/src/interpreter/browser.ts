import {
  Browser,
  BrowserContext,
  BrowserType,
  Page,
  chromium,
  firefox,
} from "@playwright/test";

import { Gen2ELogger, makeLogger } from "@rhighs/gen2e-logger";

export type Gen2EBrowserOptions = {
  browser?: "chromium" | "firefox";
  headless?: boolean;
  verbose?: boolean;
  logger?: Gen2ELogger;
};

export class Gen2EBrowser {
  options: Gen2EBrowserOptions = {};

  browser: Browser | undefined;
  context: BrowserContext | undefined;
  page: Page | undefined;
  logger: Gen2ELogger;

  constructor(options?: Gen2EBrowserOptions) {
    if (options) {
      this.options = options;
    }

    this.logger = makeLogger("GEN2E-INTEPRETER-BROWSER");
    if (options?.logger) {
      this.logger.config(options.logger);
    }
  }

  async startup() {
    let b: BrowserType | undefined = undefined;
    const browser = this.options.browser ?? "chromium";
    if (this.options.verbose) {
      this.logger.info(`Starting browser ${browser}...`);
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
    } catch (error) {
      this.logger.error("Failed stating browser, got error", error);
      throw error;
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}
