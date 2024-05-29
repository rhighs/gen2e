export class Gen2ELLMGenericError extends Error {
  public constructor(message?: string) {
    super(`Gen2E-LLM-Error: failed with error ${message}`);
  }
}

export class Gen2LLMCodeGenAgentError extends Error {
  public constructor(message?: string) {
    super(`Gen2E-LLM-Error: Agent failed generating code ${message}`);
  }
}

export class Gen2LLMAgentError extends Error {
  public constructor(message?: string) {
    super(`Gen2E-LLM-Error: Agent failed ${message}`);
  }
}
