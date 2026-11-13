import { Gen2EError } from "@rhighs/gen2e-core";

export { Gen2ECacheMissError, Gen2EError, Gen2EStaleCacheError } from "@rhighs/gen2e-core";

export class Gen2EGenError extends Gen2EError {
  public constructor(message?: string) {
    super(message);
  }
}
