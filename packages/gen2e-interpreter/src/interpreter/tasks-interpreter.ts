import { Gen2ELLMCallHooks, Page } from "@rhighs/gen2e";
import { Gen2EInterpreterError } from "../errors";
import { Gen2EBrowser } from "./browser";
import { StaticStore } from "@rhighs/gen2e";
import env from "../env";
import { pwCompile } from "../ast/pw-compile";
import { sandboxEval } from "./test-sandbox";
import { createGen2ECodeGenAgent, generateGen2ECode } from "./gen2e-gen";
import {
  Gen2ELLMAgentModel,
  Gen2ELLMCodeGenAgent,
  isModelSupported,
} from "@rhighs/gen2e-llm";
import { Gen2ELogger, makeLogger } from "@rhighs/gen2e-logger";
import {
  Gen2EInterpreterConfig,
  Gen2EInterpreterEvent,
  Gen2EInterpreterEventCallback,
  Gen2EInterpreterMode,
  Gen2EInterpreterOptions,
  Gen2EInterpreterResult,
  Gen2EInterpreterUsageStats,
} from "./types";
import { inMemStore } from "./store";
import { formatBlock, generateFakeTestCode } from "./test-code";

class TasksInterpreter {
  private events:
    | Record<Gen2EInterpreterEvent, Gen2EInterpreterEventCallback>
    | {} = {};
  private options: Gen2EInterpreterOptions = {};
  private agent: Gen2ELLMCodeGenAgent;
  private mode: Gen2EInterpreterMode = "gen2e";
  private browser?: Gen2EBrowser;
  private logger: Gen2ELogger = makeLogger("GEN2E-INTEPRETER");

  private startup?: Promise<any>;

  private recordModelsUsage: boolean;
  private usageStats?: Gen2EInterpreterUsageStats;

  private fallbackModel: string = env.OPENAI_MODEL;
  private llmCallHooks: Gen2ELLMCallHooks;

  private testTitle: string = "gen2e-recording-interpreter generated test";
  private runTimestamp: string;

  constructor(
    config: Gen2EInterpreterConfig,
    options: Gen2EInterpreterOptions
  ) {
    this.options = options;
    if (config.mode) {
      this.mode = config.mode;
    }
    if (config.logger) {
      this.logger.config(config.logger);
    }
    this.runTimestamp = (+new Date()).toString();

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
    if (options.model?.length && isModelSupported(options.model ?? "")) {
      this.fallbackModel = options.model;
    }

    const gen2eModel = (this.options.gen2eModel ??
      this.fallbackModel) as Gen2ELLMAgentModel;
    if (!isModelSupported(gen2eModel)) {
      throw new Gen2EInterpreterError(
        `failed calling gen2e expr generation, model ${gen2eModel} not suppoerted`
      );
    }
    this.agent = createGen2ECodeGenAgent(gen2eModel, undefined, this.logger);

    if (this.mode === "playwright") {
      this.browser = new Gen2EBrowser(config.browserOptions);
      this.startup = this.browser.startup();
    }
  }

  on(
    event: Gen2EInterpreterEvent,
    callback: Gen2EInterpreterEventCallback
  ): TasksInterpreter {
    this.events[event] = callback;
    return this;
  }

  private _call_event(e: Gen2EInterpreterEvent, ...args: any[]): void {
    if (e in this.events) {
      this.events[e](...args);
    }
  }

  private async gen2e(
    task: string,
    codeContext?: string
  ): Promise<string | undefined> {
    try {
      const result = await generateGen2ECode({
        agent: this.agent,
        task,
        codeContext: codeContext,
        hooks: this.llmCallHooks,
      });

      if (result.type === "success") {
        this._call_event("task-success", this, result.result);
        return result.result;
      } else {
        if (this.options.debug) {
          this.logger.error(result.errorMessage);
        }
        this._call_event("task-error", this, result.errorMessage);
      }
    } catch (err) {
      if (this.options.debug) {
        this.logger.error(err);
      }
      this._call_event("task-error", this, err);
    }

    return undefined;
  }

  private async contextWiseGen2eGen(
    tasks: string[],
    each?: (expr: string) => Promise<any>
  ): Promise<string[]> {
    const gens: string[] = [];
    for (const task of tasks) {
      const expr = await this.gen2e(task, gens.join("\n"));
      this.logger.debug(expr);
      if (expr) {
        gens.push(expr);
        if (each) {
          try {
            await each(expr);
          } catch (err) {
            this.logger.error(err);
          }
        }
      } else {
        if (this.options.debug) {
          this.logger.debug(
            `text to gen2e gave empty or null expression with task "${task}"`
          );
        }
      }
    }

    return gens;
  }

  private async _runTasks_mode_gen2e(
    tasks: string[]
  ): Promise<Gen2EInterpreterResult> {
    const genResult = await this.contextWiseGen2eGen(tasks);
    if (this.options.debug) {
      this.logger.debug("interpreter received generated code", {
        code: genResult,
      });
    }

    const body = Array.from({ length: tasks.length })
      .map((_, i): [string, string] => [tasks[i], genResult[i]])
      .map(formatBlock)
      .join("\n");

    const source = generateFakeTestCode("gen2e - interpreter gen", body);
    return {
      result: source,
      usageStats: this.usageStats,
    };
  }

  private async _runTasks_mode_playwright(
    tasks: string[],
    staticStore: StaticStore
  ): Promise<Gen2EInterpreterResult> {
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
    const gen2eResult = await this.contextWiseGen2eGen(
      tasks,
      async (expr: string): Promise<any> => {
        const fakeTestSource = generateFakeTestCode(
          "gen2e - interpreter gen",
          expr
        );

        if (this.options.debug) {
          this.logger.debug("executing sanbox for expr", { expr });
        }
        return sandboxEval(
          fakeTestSource,
          page,
          staticStore,
          this.llmCallHooks,
          {
            model: this.options.playwrightModel ?? this.fallbackModel,
            openaiApiKey: this.options.openaiApiKey,
            debug: this.options.debug,
            policies: this.options.policies,
          },
          (code: string, page: Page) => {
            const evalFunc = new Function(
              "page",
              `return (async () => { const result = await ${code}(); return result })()`
            );
            return evalFunc(page);
          },
          undefined,
          this.logger
        );
      }
    );

    const body = Array.from({ length: tasks.length })
      .map((_, i): [string, string] => [tasks[i], gen2eResult[i]])
      .map(formatBlock)
      .join("\n");

    const fakeTestSource = generateFakeTestCode(
      "gen2e - interpreter gen",
      body,
      false
    );

    const code = pwCompile(fakeTestSource, staticStore);

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

  async run(tasks: string[]): Promise<Gen2EInterpreterResult> {
    if (this.startup) {
      await this.startup;
    }

    tasks = tasks
      .map((t) => t.trim())
      .filter((t) => typeof t === "string" && t.length > 0);
    this._call_event("start", this);
    let result: Gen2EInterpreterResult;
    switch (this.mode) {
      case "playwright":
        const [_mem, staticStore] = inMemStore(this.runTimestamp);
        result = await this._runTasks_mode_playwright(tasks, staticStore);
        break;
      case "gen2e":
      default:
        result = await this._runTasks_mode_gen2e(tasks);
    }
    this._call_event("end", this);

    return result;
  }
}

export const tasksInterpreter = (
  config: Gen2EInterpreterConfig,
  options: Gen2EInterpreterOptions
): TasksInterpreter => new TasksInterpreter(config, options);
