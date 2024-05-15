import { generateGen2EExpr } from "@righs/gen2e";
import OpenAI from "openai";

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

class TasksInterpreter {
  events: Record<InterpreterEvent, InterpreterEventCallback> | {} = {};
  options: InterpreterOptions = {};
  instance: OpenAI;

  constructor(options: InterpreterOptions) {
    this.options = options;
    this.instance = new OpenAI({ apiKey: options?.openaiApiKey });
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

  async run(tasks: string[]): Promise<string> {
    let results: string[] = [];
    this._call_event("start", this, results);
    for (let task of tasks) {
      try {
        const result = await generateGen2EExpr(
          {
            task,
            codeContext: results.join("\n"),
            options: this.options,
          },
          (message) => {
            this._call_event("ai-message", this, message, results);
          },
          this.instance
        );

        if (result.type === "success") {
          this._call_event("task-success", this, result.result, results);
          results.push(result.result.expression);
        } else {
          this._call_event("task-error", this, result.errorMessage, results);
        }
      } catch (err) {
        this._call_event("task-error", this, err, results);
      }
    }
    const f = results.join("\n");
    this._call_event("end", this, f, results);
    return f;
  }
}

export const tasksInterpreter = (options: {
  debug?: boolean | undefined;
  model?: string | undefined;
  openaiApiKey?: string | undefined;
}): TasksInterpreter => new TasksInterpreter(options);
