import { gen } from "./gen";
export * from "./gen/pw";
export * from "./errors";
export type * from "./types";
export default gen;

import * as consts from "./env";

export const enableStepLogging = () => (consts.default.LOG_STEP = true);
