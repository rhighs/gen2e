import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { z } from "zod";
import { Gen2EAssertionError, gen } from "../../src";
import { promptText, scriptedModel, toolTurn } from "../support/scripted-model";

const submit = (code: string) => toolTurn({ name: "run_expression", input: { code } });

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test(
  "the model sees the real page DOM",
  gen.test(
    async ({ page, gen }) => {
      const model = scriptedModel([submit("return await page.locator('h1').innerText()")]);

      const text = await gen("get the header text", { page, test }, { model });

      expect(text).toBe("Hello, Gen2E!");
      expect(promptText(model, 0)).toContain("Hello, Gen2E!");
      expect(promptText(model, 0)).not.toContain("undefined<html");
    },
    { store: null },
  ),
);

test(
  "a failed run goes back to the model with the real Playwright error",
  gen.test(
    async ({ page, gen }) => {
      const model = scriptedModel([
        submit("await page.locator('#missing').click({ timeout: 200 })"),
        submit("await page.locator('#click-button').click()"),
      ]);

      await gen("click the button", { page, test }, { model });

      await expect(page.getByTestId("current-count")).toHaveText("1");
      expect(promptText(model, 1)).toContain("Timeout 200ms exceeded");
    },
    { store: null },
  ),
);

test(
  "screenshot debug styles are removed from the page after the capture",
  gen.test(
    async ({ page, gen }) => {
      const model = scriptedModel([submit("return 1")]);

      await gen(
        "read anything",
        { page, test },
        { model, policies: { screenshot: "force", visualDebugLevel: "high" } },
      );

      expect(promptText(model, 0)).toContain("image/jpeg");
      const leftovers = await page.evaluate(() => ({
        tagged: document.querySelectorAll("[data-tag]").length,
        styles: [...document.querySelectorAll("style")].filter((s) =>
          s.textContent?.includes("1px solid black"),
        ).length,
      }));
      expect(leftovers).toEqual({ tagged: 0, styles: 0 });
    },
    { store: null },
  ),
);

test(
  "extract, assert and vars work against the real page",
  gen.test(
    async ({ page, gen }) => {
      const header = await gen.extract(
        "read the header and the click count",
        { page, test },
        z.object({ header: z.string(), count: z.coerce.number() }),
        {
          model: scriptedModel([
            submit(
              "return { header: await page.locator('h1').innerText(), count: await page.getByTestId('current-count').innerText() }",
            ),
          ]),
        },
      );
      expect(header).toEqual({ header: "Hello, Gen2E!", count: 0 });

      await gen(
        "type {{query}} in the search box",
        { page, test },
        {
          vars: { query: "secret cats" },
          model: scriptedModel([submit("await page.getByTestId('search-input').fill(vars.query)")]),
        },
      );
      await expect(page.getByTestId("search-input")).toHaveValue("secret cats");

      const failed = await gen
        .assert(
          "the header says goodbye",
          { page, test },
          {
            model: scriptedModel([
              submit("return (await page.locator('h1').innerText()).includes('Goodbye')"),
            ]),
          },
        )
        .catch((e) => e);
      expect(failed).toBeInstanceOf(Gen2EAssertionError);
    },
    { store: null },
  ),
);

test.describe("file cache", () => {
  let dir: string;

  test.beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "gen2e-e2e-cache-"));
    process.env.GEN2E_STATIC_PATH = dir;
  });

  test.afterEach(() => {
    delete process.env.GEN2E_STATIC_PATH;
    rmSync(dir, { recursive: true, force: true });
  });

  test(
    "a solved step is written to disk and replayed without the model",
    gen.test(async ({ page, gen }) => {
      const first = scriptedModel([submit("await page.getByTestId('search-input').fill('cats')")]);
      const second = scriptedModel([]);

      await gen("type cats in the search box", { page, test }, { model: first });
      await page.reload();
      await gen("type cats in the search box", { page, test }, { model: first });
      await gen("type cats in the search box", { page, test }, { model: second });

      expect(readdirSync(path.join(dir, "steps"))).toHaveLength(1);
      expect(first.doGenerateCalls).toHaveLength(1);
      expect(second.doGenerateCalls).toHaveLength(0);
      await expect(page.getByTestId("search-input")).toHaveValue("cats");
    }),
  );
});
