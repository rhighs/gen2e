import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, type LanguageModel } from "ai";
import { Gen2ELLMGenericError } from "./errors";
import type { Gen2ELLMAgentModel } from "./types";

export type Gen2ELanguageModel = Exclude<LanguageModel, string>;

export type Gen2EModelEndpoint = {
  apiKey?: string;
  baseURL?: string;
};

export const isLanguageModel = (model: unknown): model is Gen2ELanguageModel =>
  typeof model === "object" &&
  model !== null &&
  "specificationVersion" in model &&
  "modelId" in model;

export const isModelSupported = (model: unknown): model is Gen2ELLMAgentModel =>
  (typeof model === "string" && model.trim().length > 0) || isLanguageModel(model);

export const modelId = (model: Gen2ELLMAgentModel): string =>
  typeof model === "string" ? model : `${model.provider}:${model.modelId}`;

// Chat Completions for custom endpoints, which rarely implement the Responses API; the Responses API for OpenAI itself.
export const resolveModel = (
  model: Gen2ELLMAgentModel,
  endpoint: Gen2EModelEndpoint = {},
): Gen2ELanguageModel => {
  if (typeof model !== "string") {
    return model;
  }

  const apiKey = endpoint.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Gen2ELLMGenericError(
      "no API key found for the OpenAI-compatible endpoint (set openaiApiKey or OPENAI_API_KEY)",
    );
  }

  const baseURL = endpoint.baseURL || process.env.OPENAI_BASE_URL || undefined;
  const provider = createOpenAI({ apiKey, baseURL });
  return baseURL ? provider.chat(model) : provider.responses(model);
};

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
  const id = (typeof model === "string" ? model : model.modelId).toLowerCase();
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

export const isRetryableError = (err: unknown): boolean =>
  APICallError.isInstance(err)
    ? err.isRetryable
    : isRetryableModelError(err instanceof Error ? err.message : String(err));
