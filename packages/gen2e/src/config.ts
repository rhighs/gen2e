import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Gen2ELLMAgentModel } from "@rhighs/gen2e-llm";
import type { Gen2ELogger } from "@rhighs/gen2e-logger";
import type { Gen2EConfig, Gen2EGenPolicies } from "./types";

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

  let exportedConfig = {};
  try {
    exportedConfig = require(filepath).default;
  } catch (error) {
    if (logger) {
      logger.error("loading config module error", error);
      logger.warn("unabled to load config module, skipping...");
    }
  }

  const unwrapAs = (
    prop: string,
    typename: "boolean" | "string" | "undefined" | "object" | "function" | "number" = "string",
    obj: object = exportedConfig,
  ) => (obj ? (typeof obj[prop] === typename ? obj[prop] : undefined) : undefined);

  // A model is the id served by the configured OpenAI-compatible endpoint.
  const unwrapModel = (): Gen2ELLMAgentModel | undefined => {
    const model = exportedConfig ? (exportedConfig as { model?: unknown }).model : undefined;
    if (typeof model === "string") {
      return model;
    }
    return undefined;
  };

  return {
    debug: unwrapAs("debug", "boolean"),
    openaiApiKey: unwrapAs("openaiApiKey"),
    baseURL: unwrapAs("baseURL"),
    model: unwrapModel(),
    staticStorePath: unwrapAs("staticStorePath"),
    policies: ((): Gen2EGenPolicies => {
      const obj = unwrapAs("policies", "object");
      return {
        maxRetries: unwrapAs("maxRetries", "number", obj),
        screenshot: unwrapAs("screenshot", "string", obj),
        visualDebugLevel: unwrapAs("visualDebugLevel", "string", obj),
      };
    })(),
    replayOnly: unwrapAs("replayOnly", "boolean"),
    cheapModel: unwrapAs("cheapModel"),
    ladder: unwrapAs("ladder", "boolean"),
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
