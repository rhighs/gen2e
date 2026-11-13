import path from "node:path";
import { assertTask } from "../gen";
import type { Gen2EAI, Gen2EVars, Page } from "../types";

export type PlainStep = {
  line: number;
  text: string;
  kind: "open" | "assert" | "do";
  arg: string;
};

const KEYWORDS = /^(open|assert)\s+(.+)$/i;

export const parsePlain = (src: string): PlainStep[] =>
  src.split("\n").flatMap((raw, i) => {
    const text = raw.trim();
    if (!text || text.startsWith("#")) {
      return [];
    }
    const m = text.match(KEYWORDS);
    const kind = (m?.[1]?.toLowerCase() ?? "do") as PlainStep["kind"];
    return [{ line: i + 1, text, kind, arg: m?.[2] ?? text }];
  });

export const fillVars = (s: string, vars: Gen2EVars = {}): string =>
  s.replace(/\{\{\s*(\w+)\s*\}\}/g, (all, k: string) => vars[k] ?? all);

export const runPlainStep = async (
  step: PlainStep,
  page: Page,
  ai: Gen2EAI,
  vars?: Gen2EVars,
): Promise<void> => {
  if (step.kind === "open") {
    await page.goto(fillVars(step.arg, vars));
    return;
  }
  if (step.kind === "assert") {
    await ai.assert(step.arg);
    return;
  }
  await ai(step.text);
};

export const stepTask = (step: PlainStep): string =>
  step.kind === "assert" ? assertTask(step.arg) : step.text;

export const plainTitle = (file: string): string =>
  path.relative(process.cwd(), file).replace(/\.gen2e$/, "");
