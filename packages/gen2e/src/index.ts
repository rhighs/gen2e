import * as consts from "./env";

export {
  classifyEvalError,
  defaultMakeIdent,
  defaultMakeIdentFromContext,
  estimateCostUsd,
  type Gen2EEvalErrorClass,
  type Gen2ETokenUsage,
  hashBasedIdent,
  type MakeIdentFunction,
  type StaticKeyContext,
  type StaticStore,
  wrapIdent,
} from "@rhighs/gen2e-core";
export * from "./errors";
export * from "./gen";
export * from "./io";
export * from "./playwright-gen";
export * from "./static/store/fs";
export * from "./telemetry";
export type * from "./types";
export const stepLoggingEnabled = (f: boolean) => (consts.default.LOG_STEP = f);
export const staticStoreEnabled = (f: boolean) => (consts.default.USE_STATIC_STORE = f);
