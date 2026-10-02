import { readFileSync } from "node:fs";

export type Gen2ETokenUsage = {
  promptTokens: number;
  completionTokens: number;
};

type ModelPrice = {
  prompt: number;
  completion: number;
};

/**
 * USD per 1M tokens. Small built-in catalog; unknown models report no cost.
 * `GEN2E_PRICING_FILE` can override or augment these entries with a JSON
 * object of `{ "<model>": { "prompt": number, "completion": number } }`.
 */
const PRICE_PER_MILLION: Record<string, ModelPrice> = {
  "gpt-4o-mini": { prompt: 0.15, completion: 0.6 },
  "gpt-4o": { prompt: 2.5, completion: 10 },
  "gpt-4.1-mini": { prompt: 0.4, completion: 1.6 },
  "gpt-5": { prompt: 1.25, completion: 10 },
  "claude-sonnet-4.6": { prompt: 3, completion: 15 },
  "gemini-3.8-flash": { prompt: 0.075, completion: 0.3 },
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * Reads the optional pricing override file. Read lazily on every estimate so
 * changing the env var takes effect; malformed files are ignored.
 */
const readOverrideFile = (): Record<string, ModelPrice> => {
  const file = process.env.GEN2E_PRICING_FILE?.trim();
  if (!file) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const overrides: Record<string, ModelPrice> = {};
    for (const [model, price] of Object.entries(parsed as Record<string, unknown>)) {
      if (!price || typeof price !== "object" || Array.isArray(price)) {
        continue;
      }
      const { prompt, completion } = price as { prompt?: unknown; completion?: unknown };
      if (!isFiniteNumber(prompt) || !isFiniteNumber(completion)) {
        continue;
      }
      overrides[model.trim().toLowerCase()] = { prompt, completion };
    }
    return overrides;
  } catch (_err) {
    return {};
  }
};

const resolvePrice = (model: string): ModelPrice | undefined => {
  const key = model.trim().toLowerCase();
  return readOverrideFile()[key] ?? PRICE_PER_MILLION[key];
};

/**
 * Estimates the USD cost of a token usage record. Returns undefined when the
 * model is not priced.
 */
export const estimateCostUsd = (model: string, usage: Gen2ETokenUsage): number | undefined => {
  const price = resolvePrice(model);
  if (!price) {
    return undefined;
  }

  const promptTokens = isFiniteNumber(usage?.promptTokens) ? usage.promptTokens : 0;
  const completionTokens = isFiniteNumber(usage?.completionTokens) ? usage.completionTokens : 0;
  return (
    (promptTokens / 1_000_000) * price.prompt + (completionTokens / 1_000_000) * price.completion
  );
};
