export type Gen2EEnv = {
  DEBUG_MODE: boolean;
  OPENAI_MODEL: string;
  GATEWAY_API_KEY: string;
  BASE_URL: string;
  USE_STATIC_STORE: boolean;
  LOG_STEP: boolean;
  REPLAY_ONLY: boolean;
};

const parseFlag = (f: string | undefined, def: boolean = false): boolean => {
  if (f === undefined || f.trim() === "") {
    return def;
  }

  const value = f.trim().toLowerCase();
  if (["0", "false", "off", "no"].includes(value)) {
    return false;
  }
  if (["1", "true", "on", "yes"].includes(value)) {
    return true;
  }

  const result = parseInt(value, 10);
  return Number.isNaN(result) ? true : result !== 0;
};

const parseParam = (f: string | undefined, def: string = ""): string => {
  if (!f || typeof f !== "string") {
    return def;
  }
  return f;
};

export default {
  DEBUG_MODE: parseFlag(process.env.GEN2E_DBG),
  OPENAI_MODEL: parseParam(process.env.GEN2E_MODEL, "gpt-4o-mini"),
  GATEWAY_API_KEY: parseParam(process.env.AI_GATEWAY_API_KEY),
  BASE_URL: parseParam(process.env.GEN2E_BASE_URL),
  LOG_STEP: parseFlag(process.env.GEN2E_LOG_STEP),
  USE_STATIC_STORE: parseFlag(process.env.GEN2E_USE_STATIC_STORE, true),
  REPLAY_ONLY: parseFlag(process.env.GEN2E_REPLAY_ONLY),
} as Gen2EEnv;
