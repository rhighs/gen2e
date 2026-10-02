import { Gen2EError } from "@rhighs/gen2e-core";

export { Gen2ECacheMissError, Gen2EError, Gen2EStaleCacheError } from "@rhighs/gen2e-core";

export class Gen2EGenError extends Gen2EError {
  public constructor(message?: string) {
    super(message);
  }
}

export class TestStepGenResultError extends Gen2EError {
  public constructor(message?: string) {
    super(message);
  }
}

export class LLMGenericError extends Gen2EError {
  public constructor(message?: string) {
    super(`LLM task failed with error ${message}`);
  }
}

export class LLMCodeError extends Gen2EError {
  public constructor(message?: string) {
    super(`LLM failed generaing a valid js expression got error ${message}`);
  }
}
