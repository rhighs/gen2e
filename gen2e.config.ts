import type { Gen2EConfig } from "@rhighs/gen2e";

export default {
  // Model id served by the OpenAI-compatible endpoint
  model: "gpt-4o-mini",
  policies: {
    screenshot: "off",
    maxRetries: 2,
  },
} satisfies Gen2EConfig;
