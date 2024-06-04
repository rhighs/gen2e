import {
  Gen2ELLMAgentModel,
  Gen2ELLMAgentOpenAIModel,
  Gen2ELLMAgentOpenAIModels,
} from "./types";

export * from "./code-gen-agent";
export * from "./tools";
export * from "./sanity";
export * from "./runner";
export * from "./errors";
export * from "./types";
export * from "./runner/openai-token";

export const isModelSupported = (
  model: string
): model is Gen2ELLMAgentOpenAIModel => model in Gen2ELLMAgentOpenAIModels;

export const modelSupportsImage = (model: Gen2ELLMAgentModel): boolean => {
  switch (model) {
    case "gpt-4-turbo":
    case "gpt-4-turbo-2024-04-09":
    case "gpt-4-vision-preview":
    case "gpt-4o":
    case "gpt-4o-2024-05-13":
      return true;
    default:
      return false;
  }
};
