import { existsSync } from "fs";
import { Gen2EConfig, Gen2EGenPolicies } from "./types";
import { join } from "path";
import { Gen2ELogger } from "@rhighs/gen2e-logger";

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
    typename:
      | "boolean"
      | "string"
      | "undefined"
      | "object"
      | "function"
      | "number" = "string",
    obj: object = exportedConfig
  ) =>
    obj ? (typeof obj[prop] === typename ? obj[prop] : undefined) : undefined;

  return {
    debug: unwrapAs("debug", "boolean"),
    openaiApiKey: unwrapAs("openaiApiKey"),
    model: unwrapAs("model"),
    staticStorePath: unwrapAs("staticStorePath"),
    policies: ((): Gen2EGenPolicies => {
      const obj = unwrapAs("policies", "object");
      return {
        maxRetries: unwrapAs("maxRetries", "number", obj),
        screenshot: unwrapAs("screenshot", "string", obj),
        visualDebugLevel: unwrapAs("visualDebugLevel", "string", obj),
      };
    })(),
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
