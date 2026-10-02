import readline from "node:readline";
import type { Page } from "@playwright/test";
import { gen, stepLoggingEnabled } from "@rhighs/gen2e";
import {
  createGen2ECodeGenAgent,
  evalGen2EExpression,
  Gen2EBrowser,
  type Gen2EBrowserOptions,
  generateGen2ECode,
} from "@rhighs/gen2e-interpreter";

stepLoggingEnabled(true);

import {
  type Gen2ELLMAgentModel,
  type Gen2ELLMCodeGenAgent,
  isModelSupported,
} from "@rhighs/gen2e-llm";
import { type Gen2ELogger, makeLogger } from "@rhighs/gen2e-logger";

type InterpeterREPLOptions = {
  browserOptions?: Gen2EBrowserOptions;
  verbose?: boolean;
  debug?: boolean;
  model?: string;
  openaiApiKey?: string;
  baseURL?: string;
  logger?: Gen2ELogger;
};

class InterpreterREPL {
  private agent: Gen2ELLMCodeGenAgent;

  private verbose: boolean = false;
  private results: string[] = [];
  private rl: readline.Interface;

  private browser: Gen2EBrowser;
  private startup: Promise<any>;
  private page: Page | undefined;
  private logger: Gen2ELogger = makeLogger("GEN2E-REPL");

  constructor(options: InterpeterREPLOptions) {
    const model = options.model as Gen2ELLMAgentModel;
    const opts = {
      debug: options.debug,
      openaiApiKey: options.openaiApiKey,
      baseURL: options.baseURL,
    };

    if (options.logger) {
      this.logger.config(options.logger);
    }

    if (isModelSupported(model)) {
      this.agent = createGen2ECodeGenAgent(model, opts, this.logger);
    } else if (!model) {
      this.agent = createGen2ECodeGenAgent(undefined, opts, this.logger);
    } else {
      throw new Error(`failed starting repl instance, model ${model} not supported`);
    }

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
      this.logger.info("Stopping REPL...");
    }
    await this.teardown();
    this.rl.close();
  }

  async teardown(): Promise<void> {
    if (this.verbose) {
      this.logger.info("Closing browser...");
    }
    if (this.browser) {
      await this.browser.close();
    }
  }

  async evaluate(input: string): Promise<void> {
    try {
      const result = await generateGen2ECode({
        agent: this.agent,
        task: `${input}
NOTE: code that depends on anything besides \`page\` and '\test' and 'gen' should be commented out`,
      });

      if (result.type === "success") {
        this.results.push(result.result);
        this.logger.info("evaluating expression: [", result.result, "]");
        await evalGen2EExpression(result.result, gen, this.page!);
      }
    } catch (error) {
      this.logger.error("calling generateGen2EExpr(...) gave", error.message);
    }
  }
}

export const makeREPL = (options: InterpeterREPLOptions): InterpreterREPL =>
  new InterpreterREPL(options);
