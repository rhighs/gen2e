export default {
  DEBUG_MODE: !!process.env.GEN2E_DEBUG_MODE,
  DEFAULT_MODEL: process.env.GEN2E_DEFAULT_MODEL ?? "gpt-4o-2024-05-13",
  GEN_STEP_LOG: !!process.env.GEN2E_STEP_LOG,
};
