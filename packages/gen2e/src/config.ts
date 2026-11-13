import { existsSync } from "node:fs";
import { join } from "node:path";
import { type Gen2ELLMAgentModel, isLanguageModel } from "@rhighs/gen2e-llm";
import { setStaticBasePath } from "@rhighs/gen2e-store";
import type {
  Gen2EConfig,
  Gen2EScreenshotUsagePolicy,
  Gen2EVars,
  Gen2EVisualDebugLevel,
} from "./types";

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

export function loadConfig(): Gen2EConfig | undefined {
  const filepath = configPath();
  if (!filepath) {
    return undefined;
  }

  const mod: unknown = require(filepath).default;
  const exportedConfig: Record<string, unknown> =
    mod && typeof mod === "object" ? (mod as Record<string, unknown>) : {};

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

  const strings = (v: unknown): string[] | undefined =>
    Array.isArray(v) && v.every((x) => typeof x === "string") ? v : undefined;

  const record = (v: unknown): Record<string, unknown> | undefined =>
    v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;

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
    tests: strings(exportedConfig.tests),
    vars: record(exportedConfig.vars) as Gen2EVars | undefined,
    playwright: record(exportedConfig.playwright),
  };
}

export const defineConfig = (cfg: Gen2EConfig): Gen2EConfig => cfg;

const envVars = (): Gen2EVars => {
  const raw = process.env.GEN2E_VARS;
  return raw ? (JSON.parse(raw) as Gen2EVars) : {};
};

let cached: Gen2EConfig | undefined;

// Loaded on first use: a config file that imports gen2e would otherwise see this module half-initialized.
export const config = (): Gen2EConfig => {
  if (!cached) {
    const loaded = loadConfig() ?? {};
    cached = { ...loaded, vars: { ...loaded.vars, ...envVars() } };
    setStaticBasePath(cached.staticStorePath);
  }
  return cached;
};
