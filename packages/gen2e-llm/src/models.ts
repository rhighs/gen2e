import {
  type Gen2ELLMAgentGatewayModel,
  type Gen2ELLMAgentModel,
  Gen2ELLMAgentOpenAIModels,
  type Gen2ELLMProviderModel,
} from "./types";

/**
 * True for OpenAI chat model ids handled by the OpenAI runner. Covers
 * `gpt-*` generations and the `o*` reasoning series.
 */
export const isOpenAIModel = (model: string): boolean => /^(gpt-|chatgpt-|o\d)/.test(model);

/**
 * True for `provider/model` gateway ids such as `openai/gpt-5.4`,
 * `anthropic/claude-sonnet-4.6` or `google/gemini-3.8-flash`.
 */
export const isGatewayModel = (model: string): model is Gen2ELLMAgentGatewayModel =>
  /^[^/\s]+\/[^/\s]+$/.test(model);

/**
 * True for an AI SDK language model instance (e.g. `gateway("openai/gpt-5.4")`,
 * `openai("gpt-4o-mini")`, `createOpenAI({ baseURL })("my-model")`).
 */
export const isProviderModel = (model: unknown): model is Gen2ELLMProviderModel =>
  typeof model === "object" &&
  model !== null &&
  "provider" in model &&
  typeof (model as { provider?: unknown }).provider === "string" &&
  "modelId" in model &&
  typeof (model as { modelId?: unknown }).modelId === "string";

/**
 * Runtime model support check. Known OpenAI ids, gateway ids and AI SDK
 * language model instances are supported; anything else is rejected before a
 * runner is created.
 */
export const isModelSupported = (model: unknown): model is Gen2ELLMAgentModel => {
  if (isProviderModel(model)) {
    return true;
  }
  if (typeof model !== "string") {
    return false;
  }
  return model in Gen2ELLMAgentOpenAIModels || isOpenAIModel(model) || isGatewayModel(model);
};

/**
 * Human readable id for any supported model, used in usage stats and logs.
 */
export const modelId = (model: Gen2ELLMAgentModel): string => {
  if (typeof model === "string") {
    return model;
  }
  if (isProviderModel(model)) {
    return model.modelId;
  }
  return String(model);
};

/**
 * Cache key for a model. Provider instances are keyed by provider + model id
 * so two providers exposing the same model id do not share a runner.
 */
export const modelKey = (model: Gen2ELLMAgentModel): string =>
  typeof model === "string" ? model : `${model.provider}::${model.modelId}`;

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
