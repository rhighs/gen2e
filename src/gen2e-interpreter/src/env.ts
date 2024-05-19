export type Gen2EInterpreterEnv = {
  DEFAULT_MODEL_DEBUG: boolean;
  DEFAULT_OPENAI_MODEL: string;
};

export default {
  DEFAULT_MODEL_DEBUG: !!process.env.GEN2E_I_MODEL_DEBUG,
  DEFAULT_OPENAI_MODEL:
    process.env.GEN2E_INTERPRETER_OPENAI_MODEL ?? "gpt-3.5-turbo",
} as Gen2EInterpreterEnv;
