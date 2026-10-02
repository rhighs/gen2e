import globalConfig from "../config";

/**
 * Resolves the static store base path lazily so configuration and environment
 * changes made after import time are honored by every operation.
 * @returns {string} The static store base path.
 */
export const staticBasePath = (): string =>
  globalConfig.staticStorePath ?? process.env.GEN2E_STATIC_PATH ?? ".static";
