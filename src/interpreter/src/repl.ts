import {
  Browser,
  BrowserContext,
  BrowserType,
  Page,
  chromium,
  firefox,
} from "@playwright/test";
import readline from "node:readline";
import OpenAI from "openai";

import gen, { generateGen2EExpr, type GenFunction } from "@righs/gen2e";

import { info, err } from "./log";

type InterpeterREPLOptions = {
  browser?: "chromium" | "firefox";
  headless?: boolean;
  verbose?: boolean;
  debug?: boolean;
  model?: string;
  openaiApiKey?: string;
};

class InterpreterREPL {
  options: InterpeterREPLOptions = {};
  instance: OpenAI | undefined;

  browser: Browser | undefined;
  context: BrowserContext | undefined;
  page: Page | undefined;

  verbose: boolean = false;
  results: string[] = [];
  rl: readline.Interface;

  startup: Promise<any>;

  constructor(options: InterpeterREPLOptions) {
    this.instance = new OpenAI({ apiKey: options?.openaiApiKey });
    this.options = options;
    this.verbose = options.verbose ?? false;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: "Gen2E Interpreter REPL >>> ",
    });
    this.startup = (async () => {
      let b: BrowserType | undefined = undefined;
      const browser = this.options.browser ?? "chromium";
      if (this.verbose) {
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
    })();
  }

  async start(): Promise<void> {
    await this.startup;

    this.rl.prompt();

    this.rl
      .on("line", (input) => {
        this.evaluate(input);
        this.rl.prompt();
      })
      .on("close", () => {
        this.teardown();
      });
  }

  async stop(): Promise<void> {
    if (this.verbose) {
      info("Stopping REPL...");
    }
    await this.teardown();
    this.rl.close();
  }

  async teardown(): Promise<void> {
    if (this.verbose) {
      info("Closing browser...");
    }
    if (this.browser) {
      await this.browser.close();
    }
  }

  async evaluate(input: string): Promise<void> {
    const evalExpression = async (
      genExpr: string,
      gen: GenFunction,
      page: Page
    ) => {
      try {
        if (page) {
          // rob: weird trick, don't let the compiler strip this away
          let test = null;
          (() => {
            test = null;
            return test;
          })();

          const expr = `(async () => {${genExpr}})()`;
          await eval(expr);
        }
      } catch (error) {
        err("eval() error", error.message);
      }
    };

    try {
      const result = await generateGen2EExpr({
        task: input,
        options: {
          debug: this.options.debug,
        },
      });

      if (result.type === "success") {
        this.results.push(result.result.expression);
        console.log(result.result.expression);
        evalExpression(result.result.expression, gen, this.page!);
      }
    } catch (error) {
      err("calling generateGen2EExpr(...) gave", error.message);
    }
  }
}

export const makeREPL = (options: InterpeterREPLOptions): InterpreterREPL =>
  new InterpreterREPL(options);
