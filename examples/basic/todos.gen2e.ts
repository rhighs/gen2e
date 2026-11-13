import { expect, test } from "@rhighs/gen2e";
import { z } from "zod";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("lists the todos it adds", async ({ ai }) => {
  await ai(`add the todos "water plants" and "call mom"`);

  const titles = await ai.extract("read the todo titles in order", z.array(z.string()));
  expect(titles).toEqual(["water plants", "call mom"]);
});

test("mixes generated steps with plain Playwright", async ({ ai, page }) => {
  await page.getByLabel("New todo").fill("pay rent");
  await page.keyboard.press("Enter");

  await ai("tick the pay rent todo");

  await expect(page.locator("#left")).toHaveText("0 items left");
  await ai.assert("no todo is left unchecked");
});
