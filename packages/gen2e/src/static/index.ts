import { setStaticBasePath, staticBasePath as storeStaticBasePath } from "@rhighs/gen2e-store";
import globalConfig from "../config";

// The file system store lives in @rhighs/gen2e-store and cannot read the
// library config, so the configured path is pushed to it at import time.
setStaticBasePath(globalConfig.staticStorePath);

/**
 * Resolves the static store base path lazily so configuration and environment
 * changes made after import time are honored by every operation.
 * @returns {string} The static store base path.
 */
export const staticBasePath = (): string => storeStaticBasePath();
