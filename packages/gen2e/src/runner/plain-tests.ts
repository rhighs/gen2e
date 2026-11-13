import { readFileSync } from "node:fs";
import { test } from "@playwright/test";
import cfg from "../config";
import { bindAI } from "../gen";
import type { Page } from "../types";
import { parsePlain, plainTitle, runPlainStep } from "./plain";
import { readPlan } from "./plan";

type Declare = (
  t: typeof test,
  title: string,
  body: (args: { page: Page }) => Promise<void>,
) => void;

// biome-ignore lint/security/noGlobalEval: an indirect eval of a fixed string
const globalEval = eval;

// Playwright reports a test at the stack frame that called test(); sourceURL makes that frame the .gen2e file.
const declareIn = (file: string): Declare =>
  globalEval(`(t, title, body) => t(title, body)\n//# sourceURL=${file}`);

for (const file of readPlan().plain) {
  const title = plainTitle(file);
  const steps = parsePlain(readFileSync(file, "utf8"));

  declareIn(file)(test, title, async ({ page }) => {
    const ai = bindAI(page, { title });
    for (const step of steps) {
      await test.step(step.text, () => runPlainStep(step, page, ai, cfg.vars), {
        box: true,
        location: { file, line: step.line, column: 1 },
      });
    }
  });
}
