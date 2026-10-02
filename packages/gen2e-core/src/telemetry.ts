/**
 * One record per generation step. Emitted only when telemetry is enabled.
 */
export type Gen2EStepTelemetry = {
  ts: string;
  testTitle: string;
  task: string;
  ident: string;
  cache: "hit" | "miss" | "disabled" | "replay" | "stale-regen";
  outcome: "success" | "error";
  attempts: number;
  models: string[];
  toolCalls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd?: number;
  wallClockMs: number;
  screenshotPolicy: string;
  promptVersion?: string;
  errorClass?: string;
};
