export { gen } from "./gen";
export * from "./gen/pw";
export * from "./errors";
export type * from "./types";

import * as consts from "./env";

export const stepLoggingEnabled = (f: boolean) => (consts.default.LOG_STEP = f);
export const staticStoreEnabled = (f: boolean) => (consts.default.USE_STATIC_STORE = f);
