export type Gen2EEnv = {
  DEBUG_MODE: boolean;
  OPENAI_MODEL: string;
  USE_STATIC_STORE: boolean;
  LOG_STEP: boolean;
};

const parseFlag = (f: string | undefined, def: boolean = false): boolean => {
  if (!f) {
    return def;
  }

  const result = parseInt(f);
  if (!Number.isNaN(result) || result !== 0) {
    return true;
  }

  return false;
};

const parseParam = (f: string | undefined, def: string = ""): string => {
  if (!f || typeof f !== "string") {
    return def;
  }
  return f;
};

export default {
  DEBUG_MODE: parseFlag(process.env.GEN2E_DBG),
  OPENAI_MODEL: parseParam(
    process.env.GEN2E_MODEL,
    "gpt-4o-2024-05-13"
  ),
  LOG_STEP: parseFlag(process.env.GEN2E_LOG_STEP),
  USE_STATIC_STORE: parseFlag(process.env.GEN2E_USE_STATIC_STORE, true),
} as Gen2EEnv;
