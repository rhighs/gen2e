import { appendFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import type { Gen2EStepTelemetry } from "@rhighs/gen2e-core";
import { makeLogger } from "@rhighs/gen2e-logger";

export type { Gen2EStepTelemetry } from "@rhighs/gen2e-core";

const telemetryLogger = makeLogger("GEN2E-TELEMETRY");

const DEFAULT_TELEMETRY_FILE = ".gen2e/telemetry.jsonl";

const parseFlag = (value: string | undefined): boolean => {
  if (!value) {
    return false;
  }
  return ["1", "true", "on", "yes"].includes(value.trim().toLowerCase());
};

const isEnabled = (): boolean => {
  if (parseFlag(process.env.GEN2E_TELEMETRY)) {
    return true;
  }
  const configured = process.env.GEN2E_TELEMETRY_PATH;
  return typeof configured === "string" && configured.trim() !== "";
};

/**
 * Resolves the telemetry file. `GEN2E_TELEMETRY_PATH` may point at a file or
 * at a directory; directories get the default file name appended.
 */
const resolveTelemetryPath = (): string => {
  const configured = process.env.GEN2E_TELEMETRY_PATH?.trim();
  if (!configured) {
    return path.join(process.cwd(), DEFAULT_TELEMETRY_FILE);
  }

  const looksLikeDir =
    configured.endsWith(path.sep) || (existsSync(configured) && statSync(configured).isDirectory());
  return looksLikeDir ? path.join(configured, "telemetry.jsonl") : configured;
};

/**
 * Appends one JSON line to the telemetry file when enabled through
 * `GEN2E_TELEMETRY=1` (default `.gen2e/telemetry.jsonl` under the process
 * cwd) or `GEN2E_TELEMETRY_PATH` (file or directory). Never throws: write
 * failures are swallowed and debug-logged.
 */
export const recordStepTelemetry = (record: Gen2EStepTelemetry): void => {
  if (!isEnabled()) {
    return;
  }

  try {
    const file = resolveTelemetryPath();
    mkdirSync(path.dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify(record)}\n`);
  } catch (error) {
    telemetryLogger.debug("failed to write step telemetry", { error });
  }
};
