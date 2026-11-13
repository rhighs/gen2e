import path from "node:path";
import { expect, test } from "@playwright/test";
import { checkTask, loadCorpus } from "../evals/run";

const corpus = loadCorpus(path.join(import.meta.dirname, "..", "evals", "corpus.json"));

test("every eval task has a reference solution", () => {
  expect(corpus.tasks.filter((t) => !t.reference).map((t) => t.id)).toEqual([]);
});

for (const task of corpus.tasks) {
  test(`eval reference solves ${task.id}`, async ({ page }) => {
    await page.goto(task.url);

    const value = await new Function("page", `return (async () => { ${task.reference} })()`)(page);
    const check = await checkTask(task, page, value);

    expect(check.detail).toBe("");
  });
}
