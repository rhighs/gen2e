export abstract class Gen2EError extends Error {
  public constructor(message?: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * Thrown in replay-only mode when no static cache entry matches the
 * generation request. Carries the identifier that was looked up.
 */
export class Gen2ECacheMissError extends Gen2EError {
  public readonly ident: string;

  public constructor(ident: string) {
    super(`replay-only mode: no static cache entry found for identifier ${ident}`);
    this.ident = ident;
  }
}

/**
 * Thrown when a static cache entry cannot be trusted anymore: the cached
 * expression failed at evaluation time and the failure cannot be recovered
 * from. Carries the identifier, the cached expression and classification
 * metadata.
 */
export class Gen2EStaleCacheError extends Gen2EError {
  public readonly ident: string;
  public readonly expression: string;
  public readonly meta: Record<string, unknown>;

  public constructor(ident: string, expression: string, meta: Record<string, unknown> = {}) {
    super(`static cache entry for identifier ${ident} is stale and cannot be replayed`);
    this.ident = ident;
    this.expression = expression;
    this.meta = meta;
  }
}
