export { gen, configureLogger } from "./gen";
export * from "./playwright-gen";
export * from "./errors";
export * from "./static/store/store";
export * from "./static/store/fs";
export type * from "./types";
import * as consts from "./env";

export const stepLoggingEnabled = (f: boolean) => (consts.default.LOG_STEP = f);
export const staticStoreEnabled = (f: boolean) =>
  (consts.default.USE_STATIC_STORE = f);
