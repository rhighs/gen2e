export type Gen2EEnv = {
  DEFAULT_DEBUG_MODE: boolean;
  DEFAULT_OPENAI_MODEL: string;
  LOG_STEP: boolean;
};

export default {
  DEFAULT_DEBUG_MODE: !!process.env.GEN2E_DBG,
  DEFAULT_OPENAI_MODEL:
    process.env.GEN2E_DEFAULT_OPENAI_MODEL ?? "gpt-4o-2024-05-13",
  LOG_STEP: !!process.env.GEN2E_LOG_STEP,
} as Gen2EEnv;
