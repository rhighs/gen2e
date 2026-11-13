import { z } from "zod";
import { expect, stepLoggingEnabled, test } from "../../src";

stepLoggingEnabled(true);

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("reads the header", async ({ ai }) => {
  expect(await ai.extract("get the header text", z.string())).toBe("Hello, Gen2E!");
});

test("fills the search box", async ({ ai, page }) => {
  await ai(`type "foo" in the search box`);
  await expect(page.getByTestId("search-input")).toHaveValue("foo");
});

test("clicks until the counter reaches 2", async ({ ai }) => {
  await ai("click the button until the counter value is equal to 2");
  expect(await ai.extract("get the click count", z.coerce.number())).toBe(2);
});

test("asserts what the page shows", async ({ ai }) => {
  await ai.assert(`the header says "Hello, Gen2E!"`);
  await expect(ai.assert(`the header says "Flying Donkeys"`)).rejects.toThrow();
});

test("chains an extract, an action and an assert", async ({ ai }) => {
  const header = await ai.extract("get the header text", z.string());
  await ai(`type "${header}" in the search box`);
  await ai.assert(`the search box contains "${header}"`);
});
