import { setStaticBasePath, staticBasePath as storeStaticBasePath } from "@rhighs/gen2e-store";
import globalConfig from "../config";

// The store package cannot read the library config, so the configured path is pushed to it at import time.
setStaticBasePath(globalConfig.staticStorePath);

// Resolved lazily so config and env changes after import are honored.
export const staticBasePath = (): string => storeStaticBasePath();
