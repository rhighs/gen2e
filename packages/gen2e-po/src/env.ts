export type Gen2EPOEnv = {
  MODEL_DEBUG: boolean;
  OPENAI_MODEL: string;
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
  MODEL_DEBUG: parseFlag(process.env.GEN2EPO_MODEL_DBG),
  OPENAI_MODEL: parseParam(process.env.GEN2EPO_MODEL, "gpt-4o"),
} as Gen2EPOEnv;
