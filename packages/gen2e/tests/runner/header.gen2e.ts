import { z } from "zod";
import { expect, test } from "../../src";

test("reads the header", async ({ ai, page }) => {
  await page.goto("/");
  expect(await ai.extract("read the header", z.string())).toBe("Hello, Gen2E!");
});
