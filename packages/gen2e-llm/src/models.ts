import type { Gen2ELLMAgentModel } from "./types";

/**
 * Runtime model check. Any non-empty string is a valid model id: it is the
 * configured OpenAI-compatible endpoint that decides which models exist.
 */
export const isModelSupported = (model: unknown): model is Gen2ELLMAgentModel =>
  typeof model === "string" && model.trim().length > 0;

/**
 * Human readable id for a model, used in usage stats and logs.
 */
export const modelId = (model: Gen2ELLMAgentModel): string => String(model);

const VISION_HINTS = [
  "gpt-4o",
  "gpt-4.1",
  "gpt-4.5",
  "gpt-4-turbo",
  "gpt-4-vision",
  "gpt-5",
  "gpt-6",
  "o3",
  "o4",
  "claude",
  "gemini",
  "grok",
  "llama-4",
  "qwen-vl",
  "qwen3-vl",
  "glm-4v",
  "glm-5v",
  "nova-pro",
  "nova-lite",
  "nova-2",
  "pixtral",
  "mistral-medium",
];

/**
 * Best effort vision capability probe for a model. Text-only models return
 * false; models known to accept image inputs return true. Screenshot policy
 * `force` still attaches images to any model.
 */
export const modelSupportsImage = (model: Gen2ELLMAgentModel): boolean => {
  const id = modelId(model).toLowerCase();
  return VISION_HINTS.some((hint) => id.includes(hint));
};
