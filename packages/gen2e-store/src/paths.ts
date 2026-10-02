let configuredBasePath: string | undefined;

/**
 * Overrides the base path used by the file system store. The gen2e library
 * calls this with `staticStorePath` from its config so the store keeps the
 * same resolution rules as before the package split.
 */
export const setStaticBasePath = (value?: string): void => {
  configuredBasePath = value;
};

/**
 * Resolves the static store base path lazily so configuration and environment
 * changes made after import time are honored by every operation.
 * @returns {string} The static store base path.
 */
export const staticBasePath = (): string =>
  configuredBasePath ?? process.env.GEN2E_STATIC_PATH ?? ".static";
