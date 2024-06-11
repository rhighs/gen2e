import { Gen2EError } from "@rhighs/gen2e";

export class Gen2EInterpreterError extends Gen2EError {
  public constructor(message?: string) {
    super(`Interpreter failed with error ${message}`);
  }
}

export class Gen2ESandboxError extends Gen2EError {
  public constructor(message?: string) {
    super(`Interpreter failed with error ${message}`);
  }
}

export class Gen2EIncrementalStateError extends Gen2EError {
  public constructor(message?: string) {
    super(`Incremental interpreter failed with error ${message}`);
  }
}
