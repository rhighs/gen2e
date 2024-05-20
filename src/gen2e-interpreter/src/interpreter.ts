import { Gen2EExpression, Gen2ELLMCallHooks, Page } from "@rhighs/gen2e";
import OpenAI from "openai";
import { Gen2EInterpreterError } from "./errors";
import { Gen2EBrowser, Gen2EBrowserOptions } from "./browser";
import { debug } from "./log";
import { StaticStore } from "@rhighs/gen2e/src/static/store/store";
import { generateGen2EExpr } from "./gen/gen2e";
import { compile as pwCompile } from "./ast/pw-compile";
import { sandboxEval } from "./test-sandbox";
import exp from "constants";

const generateFakeTestCode = (
  testTitle: string,
  gen2eExpressions: string[]
) => {
  let code = `\
test(
  "${testTitle}",
  gen.test(async ({ page, gen }) => {
`;
  for (let g of gen2eExpressions) {
    code += g + "\n";
  }
  code += "}))";
  return code;
};

type InterpreterEvent =
  | "start"
  | "end"
  | "task-success"
  | "task-error"
  | "ai-message";
type InterpreterEventCallback = (...args: any[]) => void;

type InterpreterOptions = {
  debug?: boolean;
  model?: string;
  openaiApiKey?: string;
  recordUsage?: boolean;
};

type InterpreterMode = "gen2e" | "playwright";

type InterpreterConfig = {
  mode?: InterpreterMode;
  browserOptions?: Gen2EBrowserOptions;
};

type InterpreterUsageStats = {
  totalCalls: number;
  completionTokens: number;
  totalTokens: number;
  promptTokens: number;
};

type InterpreterResult = {
  result: string;
  usageStats?: InterpreterUsageStats;
};

class TasksInterpreter {
  private events: Record<InterpreterEvent, InterpreterEventCallback> | {} = {};
  private options: InterpreterOptions = {};
  private instance: OpenAI;
  private mode: InterpreterMode = "gen2e";
  private browser?: Gen2EBrowser;

  private startup?: Promise<any>;

  private recordModelsUsage: boolean;
  private usageStats?: InterpreterUsageStats;

  constructor(config: InterpreterConfig, options: InterpreterOptions) {
    this.options = options;
    this.recordModelsUsage = options.recordUsage ?? false;
    if (this.recordModelsUsage) {
      this.usageStats = {
        totalCalls: 0,
        completionTokens: 0,
        totalTokens: 0,
        promptTokens: 0,
      };
    }

    this.instance = new OpenAI({ apiKey: options?.openaiApiKey });
    if (config.mode) {
      this.mode = config.mode;
    }

    if (this.mode === "playwright") {
      this.browser = new Gen2EBrowser(config.browserOptions);
      this.startup = this.browser.startup();
    }
  }

  on(
    event: InterpreterEvent,
    callback: InterpreterEventCallback
  ): TasksInterpreter {
    this.events[event] = callback;
    return this;
  }

  private _call_event(e: InterpreterEvent, ...args: any[]): void {
    if (e in this.events) {
      this.events[e](...args);
    }
  }

  private async gen2e(
    task: string,
    codeContext?: string
  ): Promise<Gen2EExpression | undefined> {
    try {
      const callHooks: Gen2ELLMCallHooks = {
        onMessage: (message) => {
          this._call_event("ai-message", this, message);
        },
      };

      if (this.recordModelsUsage && this.usageStats) {
        callHooks.onUsage = (usage) => {
          this.usageStats!.completionTokens += usage.completionTokens;
          this.usageStats!.totalTokens += usage.totalTokens;
          this.usageStats!.promptTokens += usage.promptTokens;
          this.usageStats!.totalCalls += 1;
        };
      }

      const result = await generateGen2EExpr(
        {
          task,
          codeContext: codeContext,
          options: this.options,
        },
        callHooks,
        this.instance
      );

      if (result.type === "success") {
        this._call_event("task-success", this, result.result);
        return result.result;
      } else {
        this._call_event("task-error", this, result.errorMessage);
      }
    } catch (err) {
      this._call_event("task-error", this, err);
    }

    return undefined;
  }

  private async contextWiseGen2eGen(
    tasks: string[],
    each?: (expr: Gen2EExpression) => Promise<void> | void
  ): Promise<Gen2EExpression[]> {
    const gens: Gen2EExpression[] = [];
    const gen2eAcc: string[] = [];
    for (let task of tasks) {
      let genExpr = "";
      while (genExpr === "") {
        const expr = await this.gen2e(task, gen2eAcc.join("\n"));
        debug(expr)
        if (expr) {
          if (expr.expression) {
            genExpr = expr.expression;
            gen2eAcc.push(genExpr);
            gens.push(expr);
            if (each) {
              await each(expr);
            }
          }
        } else {
          if (this.options.debug) {
            debug(`text to gen2e gave empty or null expression, got ${expr}`);
          }
        }
      }
    }
    return gens;
  }

  private async runMode_gen2e(tasks: string[]): Promise<InterpreterResult> {
    const genResult = await this.contextWiseGen2eGen(tasks);
    const expressions = genResult.map((g) => g.expression);
    if (this.options.debug) {
      debug(
        "intepreter received \n=============================\n",
        expressions.map((g, i) => `(no. call ${i})\n${g}`).join("\n"),
        "\n=============================\n"
      );
    }

    const source = generateFakeTestCode("gen2e - interpreter gen", expressions);
    return {
      result: source,
      usageStats: this.usageStats,
    };
  }

  private async runMode_playwright(
    tasks: string[]
  ): Promise<InterpreterResult> {
    const inMemoryStatic: { [key: string]: string } = {};
    const staticStore: StaticStore = {
      makeIdent: (title, task) => `gen2.interpreter - [${title}](${task})`,
      fetchStatic: (ident: string) => ({
        ident,
        expression: inMemoryStatic[ident],
      }),
      makeStatic: (content) =>
        (inMemoryStatic[content.ident] = content.expression),
    };

    if (!this.browser) {
      throw new Gen2EInterpreterError(
        "a browser instance must be initialized to perform gen2e evaluations"
      );
    }

    if (!this.browser.page) {
      throw new Gen2EInterpreterError(
        "a browser page instance must be initialized to perform gen2e evaluations"
      );
    }

    const page = this.browser.page;
    const gen2eResult = await this.contextWiseGen2eGen(tasks, async (expr) => {
      const fakeTestSource = generateFakeTestCode("gen2e - interpreter gen", [
        expr.expression,
      ]);

      await sandboxEval(
        fakeTestSource,
        page,
        staticStore,
        (code: string, page: Page) => {
          debug("AAAAAAAAAAA", code);
          return new Function(
            "page",
            `return (async () => { const result = await (${code})(); return result; })()`
          )(page);
        }
      );
    });

    debug(gen2eResult)

    const fakeTestSource = generateFakeTestCode(
      "gen2e - interpreter gen",
      gen2eResult.map((g) => g.expression)
    );

    const code = pwCompile(fakeTestSource, staticStore);
    await this.browser.close();

    return {
      result: code,
      usageStats: this.usageStats,
    };
  }

  async run(tasks: string[]): Promise<InterpreterResult> {
    if (this.startup) {
      await this.startup;
    }

    this._call_event("start", this);
    let result: InterpreterResult;
    switch (this.mode) {
      case "playwright":
        result = await this.runMode_playwright(tasks);
        break;
      case "gen2e":
      default:
        result = await this.runMode_gen2e(tasks);
    }
    this._call_event("end", this);

    return result;
  }
}

export const tasksInterpreter = (
  config: InterpreterConfig,
  options: InterpreterOptions
): TasksInterpreter => new TasksInterpreter(config, options);
