import { readFileSync } from "node:fs";

export type Gen2ETokenUsage = {
  promptTokens: number;
  completionTokens: number;
};

type ModelPrice = {
  prompt: number;
  completion: number;
};

// USD per 1M tokens; GEN2E_PRICING_FILE holds `{ "<model>": { "prompt", "completion" } }` overrides.
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

// Read on every estimate so env changes apply; a malformed file is ignored.
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

const lookupPrice = (key: string): ModelPrice | undefined =>
  readOverrideFile()[key] ?? PRICE_PER_MILLION[key];

const resolvePrice = (model: string): ModelPrice | undefined => {
  const key = model.trim().toLowerCase();
  const bare = key.slice(key.lastIndexOf(":") + 1);
  return lookupPrice(key) ?? lookupPrice(bare);
};

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
