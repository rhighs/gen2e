export abstract class Gen2EError extends Error {
  public constructor(message?: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class PlainGenResultError extends Gen2EError {
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
