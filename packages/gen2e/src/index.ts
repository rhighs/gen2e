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
export { defineConfig } from "./config";
export * from "./errors";
export { expect, test } from "./fixture";
export * from "./gen";
export { GEN2E_PROMPT_VERSION } from "./playwright-gen";
export {
  type BundleableStaticStore,
  type BundleEntry,
  exportStoreToDir,
  FSStaticStore,
  InMemoryStaticStore,
  importDirIntoStore,
  preload,
  type StaticStoreBundle,
} from "@rhighs/gen2e-store";
export type { Gen2EStepTelemetry } from "./telemetry";
export type * from "./types";

export const stepLoggingEnabled = (f: boolean) => (consts.default.LOG_STEP = f);

export const staticStoreEnabled = (f: boolean) => (consts.default.USE_STATIC_STORE = f);
