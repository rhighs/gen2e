import { test as base } from "@playwright/test";
import { bindAI } from "./gen";
import type { Gen2EAI } from "./types";

// The cache key includes the full title path, so same-named tests in different files stay apart.
export const test = base.extend<{ ai: Gen2EAI }>({
  ai: async ({ page }, use, testInfo) => {
    await use(
      bindAI(page, {
        title: testInfo.titlePath.join(" › "),
        wrap: (task, fn) => base.step(task, fn),
      }),
    );
  },
});

export { expect } from "@playwright/test";
