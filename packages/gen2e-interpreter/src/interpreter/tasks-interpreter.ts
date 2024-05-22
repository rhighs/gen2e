import { Gen2EExpression, Gen2ELLMCallHooks, Page } from "@rhighs/gen2e";
import OpenAI from "openai";
import { Gen2EInterpreterError } from "../errors";
import { Gen2EBrowser, Gen2EBrowserOptions } from "./browser";
import { debug } from "../log";
import { StaticStore } from "@rhighs/gen2e/src/static/store/store";
import { generateGen2EExpr } from "../gen/gen2e";
import { compile as pwCompile } from "../ast/pw-compile";
import { sandboxEval } from "./test-sandbox";

const generateFakeTestCode = (
  testTitle: string,
  gen2eExpressions: string[]
) => {
  let code = `\
test(
  "${testTitle}",
  gen.test(async ({ page, gen }) => {
    const GEN2E_CALLS_TIMEOUT = 300000;
    test.setTimeout(GEN2E_CALLS_TIMEOUT);
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
  gen2eModel?: string;
  playwrightModel?: string;
  openaiApiKey?: string;
  recordUsage?: boolean;
};

type InterpreterMode = "gen2e" | "playwright";

type InterpreterConfig = {
  mode?: InterpreterMode;
  browserOptions?: Gen2EBrowserOptions;
};

type InpterpreterPerModelStats = {
  model: string;
  completionTokens: number;
  totalTokens: number;
  promptTokens: number;
  toolCalls?: number;
};

type InterpreterUsageStats = {
  perModel: InpterpreterPerModelStats[];
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

  private llmCallHooks: Gen2ELLMCallHooks;

  constructor(config: InterpreterConfig, options: InterpreterOptions) {
    this.options = options;
    if (config.mode) {
      this.mode = config.mode;
    }

    this.recordModelsUsage = options.recordUsage ?? false;
    if (this.recordModelsUsage) {
      this.usageStats = {
        perModel: [],
        totalCalls: 0,
        completionTokens: 0,
        totalTokens: 0,
        promptTokens: 0,
      };
    }

    const callHooks: Gen2ELLMCallHooks = {
      onMessage: (message) => {
        this._call_event("ai-message", this, message);
      },
    };

    if (this.recordModelsUsage && this.usageStats) {
      callHooks.onUsage = (usage) => {
        if (this.usageStats) {
          const { completionTokens, totalTokens, promptTokens, model, task } =
            usage;
          const { usageStats } = this;

          usageStats.completionTokens += completionTokens;
          usageStats.totalTokens += totalTokens;
          usageStats.promptTokens += promptTokens;
          usageStats.totalCalls += 1;

          const i = usageStats.perModel.findIndex(
            ({ model: m }) => m === model
          );
          if (i !== -1) {
            const modelStats = usageStats.perModel[i];
            const updatedStats = {
              ...modelStats,
              completionTokens: modelStats.completionTokens + completionTokens,
              promptTokens: modelStats.promptTokens + promptTokens,
              totalTokens: modelStats.totalTokens + totalTokens,
              toolCalls: (modelStats.toolCalls ?? 0) + (task?.noToolCalls ?? 0),
            };
            usageStats.perModel[i] = updatedStats;
          } else {
            usageStats.perModel.push({
              model,
              completionTokens,
              totalTokens,
              promptTokens,
              toolCalls: task?.noToolCalls ?? 0,
            });
          }
        }
      };
    }

    this.llmCallHooks = callHooks;

    this.instance = new OpenAI({ apiKey: options?.openaiApiKey });
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
      const result = await generateGen2EExpr(
        {
          task,
          codeContext: codeContext,
          options: {
            model: this.options.gen2eModel ?? this.options.model,
            openaiApiKey: this.options.openaiApiKey,
            debug: this.options.debug,
          },
        },
        this.llmCallHooks,
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
        debug(expr);
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
        this.llmCallHooks,
        {
          model: this.options.playwrightModel ?? this.options.model,
          openaiApiKey: this.options.openaiApiKey,
        },
        (code: string, page: Page) => {
          const evalFunc = new Function(
            "page",
            `return (async () => { const result = await ${code}(); return result })()`
          );
          return evalFunc(page);
        }
      );
    });

    const fakeTestSource = generateFakeTestCode(
      "gen2e - interpreter gen",
      gen2eResult.map((g) => g.expression)
    );

    const code = pwCompile(fakeTestSource, staticStore);
    await this.browser.close();

    debug(inMemoryStatic);

    return {
      result: code,
      usageStats: this.usageStats,
    };
  }

  async teardown(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
    }
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
