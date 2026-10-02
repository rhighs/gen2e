import type { Gen2EConfig } from "@rhighs/gen2e";

export default {
  // OpenAI id, `provider/model` gateway id, or an AI SDK language model instance
  model: "gpt-4o-mini",
  policies: {
    screenshot: "off",
    maxRetries: 2,
  },
} satisfies Gen2EConfig;
