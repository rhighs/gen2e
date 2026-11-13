export type TokenLimitInfo = {
  context: number;
  maxOut: number;
};

export const tokenLimits = (model: string): TokenLimitInfo => {
  const modelContext: Record<string, TokenLimitInfo> = {
    "gpt-3.5-turbo": {
      context: 16385,
      maxOut: 4096,
    },
    "gpt-3.5-turbo-0125": {
      context: 16385,
      maxOut: 4096,
    },
    "gpt-3.5-turbo-0301": {
      context: 4097,
      maxOut: 4097,
    },
    "gpt-3.5-turbo-0613": {
      context: 4097,
      maxOut: 4097,
    },
    "gpt-3.5-turbo-1106": {
      context: 16385,
      maxOut: 4096,
    },
    "gpt-3.5-turbo-16k": {
      context: 16385,
      maxOut: 16385,
    },
    "gpt-3.5-turbo-16k-0613": {
      context: 16385,
      maxOut: 16385,
    },
    "gpt-4": {
      context: 8192,
      maxOut: 8192,
    },
    "gpt-4-0125-preview": {
      context: 128000,
      maxOut: 4096,
    },
    "gpt-4-0314": {
      context: 8192,
      maxOut: 8192,
    },
    "gpt-4-0613": {
      context: 8192,
      maxOut: 8192,
    },
    "gpt-4-1106-preview": {
      context: 128000,
      maxOut: 4096,
    },
    "gpt-4-32k": {
      context: 32768,
      maxOut: 32768,
    },
    "gpt-4-32k-0314": {
      context: 32768,
      maxOut: 32768,
    },
    "gpt-4-32k-0613": {
      context: 32768,
      maxOut: 32768,
    },
    "gpt-4-turbo-preview": {
      context: 128000,
      maxOut: 4096,
    },
    "gpt-4-vision-preview": {
      context: 128000,
      maxOut: 4096,
    },
    "gpt-4-turbo": {
      context: 128000,
      maxOut: 4096,
    },
    "gpt-4-turbo-2024-04-09": {
      context: 128000,
      maxOut: 4096,
    },
    "gpt-4o": {
      context: 128000,
      maxOut: 0,
    },
    "gpt-4o-2024-05-13": {
      context: 128000,
      maxOut: 0,
    },
    "davinci-002": {
      context: 0,
      maxOut: 0,
    },
    "babbage-002": {
      context: 0,
      maxOut: 0,
    },
    "text-davinci-003": {
      context: 0,
      maxOut: 0,
    },
    "text-davinci-002": {
      context: 0,
      maxOut: 0,
    },
    "text-davinci-001": {
      context: 0,
      maxOut: 0,
    },
    "text-curie-001": {
      context: 0,
      maxOut: 0,
    },
    "text-babbage-001": {
      context: 0,
      maxOut: 0,
    },
    "text-ada-001": {
      context: 0,
      maxOut: 0,
    },
    davinci: {
      context: 0,
      maxOut: 0,
    },
    curie: {
      context: 0,
      maxOut: 0,
    },
    babbage: {
      context: 0,
      maxOut: 0,
    },
    ada: {
      context: 0,
      maxOut: 0,
    },
    "code-davinci-002": {
      context: 0,
      maxOut: 0,
    },
    "code-davinci-001": {
      context: 0,
      maxOut: 0,
    },
    "code-cushman-002": {
      context: 0,
      maxOut: 0,
    },
    "code-cushman-001": {
      context: 0,
      maxOut: 0,
    },
    "davinci-codex": {
      context: 0,
      maxOut: 0,
    },
    "cushman-codex": {
      context: 0,
      maxOut: 0,
    },
    "text-davinci-edit-001": {
      context: 0,
      maxOut: 0,
    },
    "code-davinci-edit-001": {
      context: 0,
      maxOut: 0,
    },
    "text-embedding-ada-002": {
      context: 0,
      maxOut: 0,
    },
    "text-similarity-davinci-001": {
      context: 0,
      maxOut: 0,
    },
    "text-similarity-curie-001": {
      context: 0,
      maxOut: 0,
    },
    "text-similarity-babbage-001": {
      context: 0,
      maxOut: 0,
    },
    "text-similarity-ada-001": {
      context: 0,
      maxOut: 0,
    },
    "text-search-davinci-doc-001": {
      context: 0,
      maxOut: 0,
    },
    "text-search-curie-doc-001": {
      context: 0,
      maxOut: 0,
    },
    "text-search-babbage-doc-001": {
      context: 0,
      maxOut: 0,
    },
    "text-search-ada-doc-001": {
      context: 0,
      maxOut: 0,
    },
    "code-search-babbage-code-001": {
      context: 0,
      maxOut: 0,
    },
    "code-search-ada-code-001": {
      context: 0,
      maxOut: 0,
    },
    gpt2: {
      context: 0,
      maxOut: 0,
    },
    "gpt-35-turbo": {
      context: 0,
      maxOut: 0,
    },
    "gpt-3.5-turbo-instruct": {
      context: 0,
      maxOut: 0,
    },
    "gpt-3.5-turbo-instruct-0914": {
      context: 0,
      maxOut: 0,
    },
  };

  const limits = modelContext[model];
  if (limits && limits.context > 0) {
    return limits;
  }

  return {
    context: 128_000,
    maxOut: 16_384,
  };
};

export const _MARGIN: number = 2;

export const countTokenApprox = (text: string): number => {
  const approx = text.length * (1 / Math.E) + _MARGIN;
  return approx;
};

export const fitsContext = (
  model: string,
  text: string,
  getTokenLimit: (model: string) => TokenLimitInfo = tokenLimits,
): boolean => {
  return maxCharactersApprox(model, getTokenLimit) > text.length;
};

export const maxCharactersApprox = (
  model: string,
  getTokenLimit: (model: string) => TokenLimitInfo = tokenLimits,
): number => {
  const max = getTokenLimit(model).context;
  return (max - _MARGIN) * Math.E;
};
