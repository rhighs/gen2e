import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { expect, Gen2EAssertionError, test } from "../../src";
import { promptText, scriptedModel, toolTurn } from "../support/scripted-model";

const submit = (code: string) => toolTurn({ name: "run_expression", input: { code } });

let dir: string;

test.beforeEach(async ({ page }) => {
  dir = mkdtempSync(path.join(tmpdir(), "gen2e-e2e-cache-"));
  process.env.GEN2E_STATIC_PATH = dir;
  await page.goto("/");
});

test.afterEach(() => {
  delete process.env.GEN2E_STATIC_PATH;
  rmSync(dir, { recursive: true, force: true });
});

const steps = () =>
  readdirSync(path.join(dir, "steps")).map((f) =>
    JSON.parse(readFileSync(path.join(dir, "steps", f), "utf8")),
  );

test("the model sees the real page DOM", async ({ ai }) => {
  const model = scriptedModel([submit("return await page.locator('h1').innerText()")]);

  const text = await ai("get the header text", { model });

  expect(text).toBe("Hello, Gen2E!");
  expect(promptText(model, 0)).toContain("Hello, Gen2E!");
  expect(promptText(model, 0)).not.toContain("undefined<html");
});

test("a failed run goes back to the model with the real Playwright error", async ({ ai, page }) => {
  const model = scriptedModel([
    submit("await page.locator('#missing').click({ timeout: 200 })"),
    submit("await page.locator('#click-button').click()"),
  ]);

  await ai("click the button", { model });

  await expect(page.getByTestId("current-count")).toHaveText("1");
  expect(promptText(model, 1)).toContain("Timeout 200ms exceeded");
});

test("screenshot debug styles are removed from the page after the capture", async ({
  ai,
  page,
}) => {
  const model = scriptedModel([submit("return 1")]);

  await ai("read anything", {
    model,
    policies: { screenshot: "force", visualDebugLevel: "high" },
  });

  expect(promptText(model, 0)).toContain("image/jpeg");
  const leftovers = await page.evaluate(() => ({
    tagged: document.querySelectorAll("[data-tag]").length,
    styles: [...document.querySelectorAll("style")].filter((s) =>
      s.textContent?.includes("1px solid black"),
    ).length,
  }));
  expect(leftovers).toEqual({ tagged: 0, styles: 0 });
});

test("extract, assert and vars work against the real page", async ({ ai, page }) => {
  const header = await ai.extract(
    "read the header and the click count",
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

  await ai("type {{query}} in the search box", {
    vars: { query: "secret cats" },
    model: scriptedModel([submit("await page.getByTestId('search-input').fill(vars.query)")]),
  });
  await expect(page.getByTestId("search-input")).toHaveValue("secret cats");

  const failed = await ai
    .assert("the header says goodbye", {
      model: scriptedModel([
        submit("return (await page.locator('h1').innerText()).includes('Goodbye')"),
      ]),
    })
    .catch((e: unknown) => e);
  expect(failed).toBeInstanceOf(Gen2EAssertionError);
});

test.describe("file cache", () => {
  test("a solved step is written to disk and replayed without the model", async ({ ai, page }) => {
    const first = scriptedModel([submit("await page.getByTestId('search-input').fill('cats')")]);
    const second = scriptedModel([]);

    await ai("type cats in the search box", { model: first });
    await page.reload();
    await ai("type cats in the search box", { model: first });
    await ai("type cats in the search box", { model: second });

    expect(steps()).toHaveLength(1);
    expect(steps()[0].context.testTitle).toBe(
      "scripted.spec.ts › file cache › a solved step is written to disk and replayed without the model",
    );
    expect(first.doGenerateCalls).toHaveLength(1);
    expect(second.doGenerateCalls).toHaveLength(0);
    await expect(page.getByTestId("search-input")).toHaveValue("cats");
  });
});
