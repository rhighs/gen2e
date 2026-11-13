export type Gen2EPOEnv = {
  OPENAI_MODEL: string;
};

const parseParam = (f: string | undefined, def: string = ""): string => {
  if (!f || typeof f !== "string") {
    return def;
  }
  return f;
};

export default {
  OPENAI_MODEL: parseParam(process.env.GEN2EPO_MODEL, "gpt-4o"),
} as Gen2EPOEnv;
