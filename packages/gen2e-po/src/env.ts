export type Gen2EPOEnv = {
  MODEL_DEBUG: boolean;
  OPENAI_MODEL: string;
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
  MODEL_DEBUG: parseFlag(process.env.GEN2EPO_MODEL_DBG),
  OPENAI_MODEL: parseParam(process.env.GEN2EPO_MODEL, "gpt-3.5-turbo"),
} as Gen2EPOEnv;
