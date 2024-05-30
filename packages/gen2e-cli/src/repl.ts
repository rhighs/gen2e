import { Page } from "@playwright/test";
import readline from "node:readline";
import OpenAI from "openai";

import {
  generateGen2ECode,
  Gen2EBrowser,
  Gen2EBrowserOptions,
  evalGen2EExpression,
  createGen2ECodeGenAgent,
} from "@rhighs/gen2e-interpreter";
import { gen, stepLoggingEnabled } from "@rhighs/gen2e";
stepLoggingEnabled(true);

import { err, info } from "./log";
import {
  Gen2ELLMAgentModel,
  Gen2ELLMCodeGenAgent,
  isModelSupported,
} from "@rhighs/gen2e-llm";

type InterpeterREPLOptions = {
  browserOptions?: Gen2EBrowserOptions;
  verbose?: boolean;
  debug?: boolean;
  model?: string;
  openaiApiKey?: string;
};

class InterpreterREPL {
  private agent: Gen2ELLMCodeGenAgent;

  private verbose: boolean = false;
  private results: string[] = [];
  private rl: readline.Interface;

  private browser: Gen2EBrowser;
  private startup: Promise<any>;
  private page: Page | undefined;

  constructor(options: InterpeterREPLOptions) {
    const model = options.model as Gen2ELLMAgentModel;
    const opts = {
      debug: options.debug,
      openaiApiKey: options.openaiApiKey,
    };

    if (isModelSupported(model)) {
      this.agent = createGen2ECodeGenAgent(model, opts);
    } else if (!model) {
      this.agent = createGen2ECodeGenAgent(undefined, opts);
    } else {
      throw new Error(
        `failed starting repl instance, model ${model} not supported`
      );
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
      const result = await generateGen2ECode({
        agent: this.agent,
        task: `${input}
NOTE: code that depends on anything besides \`page\` and '\test\' and \'gen\' should be commented out`,
      });

      if (result.type === "success") {
        this.results.push(result.result);
        info("evaluating expression: [", result.result, "]");
        await evalGen2EExpression(result.result, gen, this.page!);
      }
    } catch (error) {
      err("calling generateGen2EExpr(...) gave", error.message);
    }
  }
}

export const makeREPL = (options: InterpeterREPLOptions): InterpreterREPL =>
  new InterpreterREPL(options);
