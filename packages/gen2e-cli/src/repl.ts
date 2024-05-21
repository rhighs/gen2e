import { Page } from "@playwright/test";
import readline from "node:readline";
import OpenAI from "openai";

import {
  generateGen2EExpr,
  Gen2EBrowser,
  Gen2EBrowserOptions,
  evalGen2EExpression,
} from "@rhighs/gen2e-intepreter";
import { gen, stepLoggingEnabled } from "@rhighs/gen2e";
stepLoggingEnabled(true);

import { err, info } from "./log";

type InterpeterREPLOptions = {
  browserOptions?: Gen2EBrowserOptions;
  verbose?: boolean;
  debug?: boolean;
  model?: string;
  openaiApiKey?: string;
};

class InterpreterREPL {
  options: InterpeterREPLOptions = {};
  instance: OpenAI | undefined;

  verbose: boolean = false;
  results: string[] = [];
  rl: readline.Interface;

  browser: Gen2EBrowser;
  startup: Promise<any>;
  page: Page | undefined;

  constructor(options: InterpeterREPLOptions) {
    this.instance = new OpenAI({ apiKey: options?.openaiApiKey });
    this.options = options;
    this.verbose = options.verbose ?? false;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: "\x1b[33mGen2E Interpreter REPL >>>\x1b[0m ",
    });

    this.browser = new Gen2EBrowser(options.browserOptions);
    this.startup = this.browser.startup();
  }

  async start(): Promise<void> {
    await this.startup;
    this.page = this.browser.page;

    this.rl.prompt();
    this.rl
      .on("line", async (input) => {
        await this.evaluate(input);
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
    try {
      const result = await generateGen2EExpr({
        task: `${input}
NOTE: code that depends on anything besides \`page\` and '\test\' and \'gen\' should be commented out`,
        options: {
          debug: this.options.debug,
        },
      });

      if (result.type === "success") {
        this.results.push(result.result.expression);
        info("evaluating expression: [", result.result.expression, "]");
        await evalGen2EExpression(result.result.expression, gen, this.page!);
      }
    } catch (error) {
      err("calling generateGen2EExpr(...) gave", error.message);
    }
  }
}

export const makeREPL = (options: InterpeterREPLOptions): InterpreterREPL =>
  new InterpreterREPL(options);
