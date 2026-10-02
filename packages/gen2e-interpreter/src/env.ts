export type Gen2EInterpreterEnv = {
  MODEL_DEBUG: boolean;
  OPENAI_MODEL: string;
  GATEWAY_API_KEY: string;
  BASE_URL: string;
  SANDBOX_DEBUG: boolean;
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
  MODEL_DEBUG: parseFlag(process.env.GEN2EI_MODEL_DBG),
  OPENAI_MODEL: parseParam(process.env.GEN2EI_MODEL, "gpt-4o-mini"),
  GATEWAY_API_KEY: parseParam(process.env.AI_GATEWAY_API_KEY),
  BASE_URL: parseParam(process.env.GEN2EI_BASE_URL),
  SANDBOX_DEBUG: parseFlag(process.env.GEN2EI_SANDBOX_DBG),
} as Gen2EInterpreterEnv;
