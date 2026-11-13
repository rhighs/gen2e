import { existsSync } from "node:fs";
import { join } from "node:path";
import { type Gen2ELLMAgentModel, isLanguageModel } from "@rhighs/gen2e-llm";
import type { Gen2ELogger } from "@rhighs/gen2e-logger";
import type { Gen2EConfig, Gen2EScreenshotUsagePolicy, Gen2EVisualDebugLevel } from "./types";

const SCREENSHOT_POLICIES: readonly Gen2EScreenshotUsagePolicy[] = [
  "force",
  "model",
  "onfail",
  "off",
];

const VISUAL_DEBUG_LEVELS: readonly Gen2EVisualDebugLevel[] = ["none", "medium", "high"];

const configPath = (configname = "gen2e.config") =>
  ["ts", "js", "cjs", "mjs"]
    .map((e) => `${configname}.${e}`)
    .map((f) => join(process.cwd(), f))
    .find((fp) => existsSync(fp));

export function loadConfig(logger?: Gen2ELogger): Gen2EConfig | undefined {
  const filepath = configPath();
  if (!filepath) {
    return undefined;
  }

  let exportedConfig: Record<string, unknown> = {};
  try {
    const mod: unknown = require(filepath).default;
    exportedConfig = mod && typeof mod === "object" ? (mod as Record<string, unknown>) : {};
  } catch (error) {
    if (logger) {
      logger.error("loading config module error", error);
      logger.warn("unabled to load config module, skipping...");
    }
  }

  const str = (o: Record<string, unknown>, k: string): string | undefined => {
    const v = o[k];
    return typeof v === "string" ? v : undefined;
  };

  const modelOf = (o: Record<string, unknown>, k: string): Gen2ELLMAgentModel | undefined => {
    const v = o[k];
    return isLanguageModel(v) ? v : str(o, k);
  };

  const bool = (o: Record<string, unknown>, k: string): boolean | undefined => {
    const v = o[k];
    return typeof v === "boolean" ? v : undefined;
  };

  const num = (o: Record<string, unknown>, k: string): number | undefined => {
    const v = o[k];
    return typeof v === "number" ? v : undefined;
  };

  const oneOf = <T extends string>(
    o: Record<string, unknown>,
    k: string,
    allowed: readonly T[],
  ) => {
    const v = o[k];
    return allowed.find((a) => a === v);
  };

  const rawPolicies = exportedConfig.policies;
  const policies: Record<string, unknown> =
    rawPolicies && typeof rawPolicies === "object" ? (rawPolicies as Record<string, unknown>) : {};

  return {
    debug: bool(exportedConfig, "debug"),
    openaiApiKey: str(exportedConfig, "openaiApiKey"),
    baseURL: str(exportedConfig, "baseURL"),
    model: modelOf(exportedConfig, "model"),
    staticStorePath: str(exportedConfig, "staticStorePath"),
    policies: {
      maxRetries: num(policies, "maxRetries"),
      screenshot: oneOf(policies, "screenshot", SCREENSHOT_POLICIES),
      visualDebugLevel: oneOf(policies, "visualDebugLevel", VISUAL_DEBUG_LEVELS),
    },
    replayOnly: bool(exportedConfig, "replayOnly"),
    cheapModel: modelOf(exportedConfig, "cheapModel"),
    ladder: bool(exportedConfig, "ladder"),
  };
}

let config: Gen2EConfig | undefined;
export default ((): Gen2EConfig => {
  if (!config) {
    const c = loadConfig();
    if (!c) {
      config = {};
    } else {
      config = c;
    }
  }
  return config;
})();
