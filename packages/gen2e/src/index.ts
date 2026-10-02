import * as consts from "./env";

export * from "./errors";
export * from "./gen";
export * from "./io";
export * from "./playwright-gen";
export * from "./static/store/fs";
export * from "./static/store/store";
export type * from "./types";
export const stepLoggingEnabled = (f: boolean) => (consts.default.LOG_STEP = f);
export const staticStoreEnabled = (f: boolean) => (consts.default.USE_STATIC_STORE = f);
