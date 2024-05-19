import gen, { Gen2EError, Gen2EExpression, Page } from "@rhighs/gen2e";
import OpenAI from "openai";
import { Gen2EBrowser, Gen2EBrowserOptions } from "./browser";
import { info, warn } from "./log";
import { StaticStore } from "@rhighs/gen2e/src/static/store/store";
import { generateGen2EExpr } from "./gen/gen2e";
import { compile as pwCompile } from "./ast/pw-compile";
import { evalGen2EExpression } from "./eval";
import { sandboxEval } from "./test-sandbox";

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
  info(`fake test code:\n`, code);
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
};

type InterpreterMode = "gen2e" | "playwright";

type InterpreterConfig = {
  mode?: InterpreterMode;
  browserOptions?: Gen2EBrowserOptions;
};

export class Gen2EInterpreterError extends Gen2EError {
  public constructor(message?: string) {
    super(`Interpreter failed with error ${message}`);
  }
}

class TasksInterpreter {
  events: Record<InterpreterEvent, InterpreterEventCallback> | {} = {};
  options: InterpreterOptions = {};
  instance: OpenAI;
  mode: InterpreterMode = "gen2e";
  browser?: Gen2EBrowser;

  startup?: Promise<any>;

  constructor(config: InterpreterConfig, options: InterpreterOptions) {
    this.options = options;
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

  async textTogen2e(
    task: string,
    codeContext?: string
  ): Promise<Gen2EExpression | undefined> {
    try {
      const result = await generateGen2EExpr(
        {
          task,
          codeContext: codeContext,
          options: this.options,
        },
        (message) => {
          this._call_event("ai-message", this, message);
        },
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

  async evalPwExpr(expression: string, page: Page): Promise<void> {
    return eval(`${expression}()`);
  }

  async run(tasks: string[]): Promise<string> {
    if (this.startup) {
      await this.startup;
    }
    this._call_event("start", this);

    const gen2eAcc: string[] = [];
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

    let transforms: ((task: string) => Promise<string>)[] = [
      (task) =>
        this.textTogen2e(task, gen2eAcc.join("\n")).then(
          (expr) => (gen2eAcc.push(expr!.expression), expr!.expression)
        ),
    ];

    if (this.mode === "playwright" && this.browser) {
      const page = this.browser.page!;
      transforms.push(async (expr) => {
        await evalGen2EExpression(expr, gen, page);
        return expr;
      });
    }

    const expressions: string[] = [];
    for (let task of tasks) {
      let T_result = task;
      for (let T of transforms) {
        T_result = await T(T_result);
      }

      expressions.push(T_result);
    }
    let code = "";

    if (this.options.debug) {
      for (let g of gen2eAcc) {
        warn(g);
      }
    }

    if (this.mode == "playwright") {
      const fakeTestSource = generateFakeTestCode(
        "gen2e - interpreter gen",
        gen2eAcc
      );
      await sandboxEval(fakeTestSource, this.browser!.page!, staticStore);
      code = pwCompile(fakeTestSource, staticStore);
      warn(JSON.stringify(inMemoryStatic, null, 4));
    } else {
      code = expressions.join("\n");
    }

    this._call_event("end", this);
    return code;
  }
}

export const tasksInterpreter = (
  config: InterpreterConfig,
  options: {
    debug?: boolean | undefined;
    model?: string | undefined;
    openaiApiKey?: string | undefined;
  }
): TasksInterpreter => new TasksInterpreter(config, options);
