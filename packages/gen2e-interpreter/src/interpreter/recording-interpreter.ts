import { Gen2ELLMCallHooks, Page } from "@rhighs/gen2e";
import { Gen2EIncrementalStateError, Gen2EInterpreterError } from "../errors";
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
  Gen2EInterpreterUsageStats,
  Gen2ERecordingPeekResult,
  Gen2ERecordingResult,
  Gen2ERecordingStep,
} from "./types";
import { Gen2EInterpreterInMemStatic, inMemStore } from "./store";
import { generateFakeTestCode } from "./test-code";

export class RecordingInterpreter {
  private events:
    | Record<Gen2EInterpreterEvent, Gen2EInterpreterEventCallback>
    | {} = {};
  private options: Gen2EInterpreterOptions = {};
  private agent: Gen2ELLMCodeGenAgent;
  private mode: Gen2EInterpreterMode = "gen2e";
  private browser?: Gen2EBrowser;
  private logger: Gen2ELogger = makeLogger("GEN2E-INTEPRETER");

  private recordModelsUsage: boolean;
  private usageStats?: Gen2EInterpreterUsageStats;

  private fallbackModel: string = env.OPENAI_MODEL;
  private llmCallHooks: Gen2ELLMCallHooks;
  private config: Gen2EInterpreterConfig;

  private state: "idle" | "running" = "idle";
  private gen2eExpressions: string[] = [];
  private currentStore: StaticStore;
  private getStaticMem: () => Gen2EInterpreterInMemStatic;

  constructor(
    config: Gen2EInterpreterConfig,
    options: Gen2EInterpreterOptions
  ) {
    this.options = options;
    this.config = config;
    if (config.mode) {
      this.mode = config.mode;
    }
    if (config.logger) {
      this.logger.config(config.logger);
    }

    const [getMem, staticStore] = inMemStore();
    this.currentStore = staticStore;
    this.getStaticMem = getMem;

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
  }

  on(
    event: Gen2EInterpreterEvent,
    callback: Gen2EInterpreterEventCallback
  ): RecordingInterpreter {
    this.events[event] = callback;
    return this;
  }

  private setupStore() {
    const [getMem, staticStore] = inMemStore();
    this.currentStore = staticStore;
    this.getStaticMem = getMem;
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

  async start(): Promise<void> {
    if (this.state !== "idle") {
      throw new Gen2EIncrementalStateError(
        "cannot start while running, you must call done()"
      );
    }

    this.gen2eExpressions = [];
    if (this.mode === "playwright") {
      const [getMem, store] = inMemStore();
      this.browser = new Gen2EBrowser(this.config.browserOptions);
      await this.browser.startup();
      this.currentStore = store;
      this.getStaticMem = getMem;
    }

    this.state = "running";
  }

  async update(task: string): Promise<Gen2ERecordingStep> {
    if (this.state !== "running") {
      throw new Gen2EIncrementalStateError(
        "cannot update while idle, you must call start() first"
      );
    }

    task = task.trim();
    let genResult = "";

    switch (this.mode) {
      case "playwright":
        genResult = await this.handlePlaywrightMode(task);
        break;
      case "gen2e":
        genResult = await this.handleGen2EMode(task);
        break;
    }

    return {
      result: genResult ?? "",
    };
  }

  private async handlePlaywrightMode(task: string): Promise<string> {
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

    const result = await this.gen2e(task, this.gen2eExpressions.join("\n"));
    if (!result) {
      this.handleError("gen2e gen gave empty result", result);
      return "";
    }

    this.gen2eExpressions.push(result);
    const [getMem, localStore] = inMemStore();
    const fakeTestSource = generateFakeTestCode("gen2e - interpreter gen", [
      result,
    ]);
    const page = this.browser.page;

    if (this.options.debug) {
      this.logger.debug("executing sandbox for expr", { result });
    }

    await this.executeSandboxEval(fakeTestSource, page, localStore);

    const mem = getMem();
    const [[k, v]] = Object.entries(mem);
    this.currentStore.makeStatic({ ident: k, expression: v });

    if (this.options.debug) {
      this.logger.debug("sandbox memory", this.getStaticMem());
      this.logger.debug("playwright mode", v);
    }

    return v;
  }

  private async handleGen2EMode(task: string): Promise<string> {
    const result = await this.gen2e(task, this.gen2eExpressions.join("\n"));
    if (!result) {
      this.handleError("gen2e gen gave empty result", result);
      return "";
    }

    this.gen2eExpressions.push(result);
    this.logger.debug("gen2e mode", result);
    return result;
  }

  private handleError(message: string, result: any) {
    this.logger.error(message, { result });
  }

  private async executeSandboxEval(
    fakeTestSource: string,
    page: Page,
    localStore: any
  ): Promise<void> {
    await sandboxEval(
      fakeTestSource,
      page,
      localStore,
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

  async finish(): Promise<Gen2ERecordingResult> {
    if (this.state !== "running") {
      throw new Gen2EIncrementalStateError(
        "cannot finish while idle, you must call start() first"
      );
    }

    const { result } = this.peek();

    this.state = "idle";
    if (this.options.debug) {
      this.logger.info("tearing down instances");
    }
    await this.teardown();
    if (this.options.debug) {
      this.logger.info("teardown done");
    }

    return {
      result,
    };
  }

  peek(): Gen2ERecordingPeekResult {
    let genResult = "";
    switch (this.mode) {
      case "playwright":
        {
          const fakeTestSource = generateFakeTestCode(
            "gen2e - interpreter gen",
            this.gen2eExpressions,
            false
          );

          const code = pwCompile(fakeTestSource, this.currentStore);
          genResult = code;
        }
        break;
      case "gen2e":
        {
          genResult = generateFakeTestCode(
            "gen2e - interpreter gen",
            this.gen2eExpressions,
            false
          );
        }
        break;
    }

    return {
      result: genResult,
    };
  }

  async teardown(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
    }
  }

  ready(): boolean {
    return this.state !== "idle";
  }
}

export const recordingInterpreter = (
  config: Gen2EInterpreterConfig,
  options: Gen2EInterpreterOptions
): RecordingInterpreter => new RecordingInterpreter(config, options);
