export abstract class Gen2EPlaywrightError extends Error {
  public constructor(message?: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnimplementedError extends Gen2EPlaywrightError {
  public constructor(message?: string) {
    super(message);
  }
}
