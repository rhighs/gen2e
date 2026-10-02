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

/**
 * Whether a model error reason is worth retrying on a different model:
 * rate limiting, overload/capacity, timeouts and transient connection or
 * server failures. Authentication, validation and shape errors are not.
 */
export const isRetryableModelError = (reason: string): boolean => {
  if (typeof reason !== "string" || reason.trim() === "") {
    return false;
  }

  const message = reason.toLowerCase();

  if (
    message.includes("429") ||
    message.includes("rate limit") ||
    message.includes("too many requests")
  ) {
    return true;
  }

  if (message.includes("overloaded") || message.includes("capacity")) {
    return true;
  }

  if (
    message.includes("timeout") ||
    message.includes("etimedout") ||
    message.includes("econnreset")
  ) {
    return true;
  }

  if (/\b5\d{2}\b/.test(message)) {
    return true;
  }

  return (
    message.includes("internal server error") ||
    message.includes("bad gateway") ||
    message.includes("service unavailable") ||
    message.includes("gateway timeout")
  );
};
