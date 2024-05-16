import { gen } from "./gen";
export * from "./gen/gen2e";
export * from "./gen/playwright";
export * from "./errors";
export type * from "./types";
export default gen;

import * as consts from './constants'

export const enableStepLogging = () => consts.default.GEN_STEP_LOG = true