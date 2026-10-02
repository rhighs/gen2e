import { expect, test } from "@playwright/test";
import { getDomRevision, installDomRevisionTracker } from "../../src/snapshot";

/**
 * Real-browser coverage for the DOM revision counters used to decide when a
 * captured snapshot can be reused. Runs against the fixture server started by
 * playwright.config.ts; keep it out of the unit run (jest only matches
 * tests/unit).
 */
test.describe("dom revision tracking", () => {
  test("detects an in-place dom mutation", async ({ page }) => {
    await installDomRevisionTracker(page);
    await page.goto("/");
    const before = await getDomRevision(page);

    await page.evaluate(() => {
      const marker = document.createElement("div");
      marker.id = "mutation-marker";
      marker.textContent = "mutated";
      document.body.appendChild(marker);
    });

    await expect
      .poll(async () => (await getDomRevision(page)).mutations)
      .toBeGreaterThan(before.mutations);
    expect((await getDomRevision(page)).navigations).toBe(before.navigations);
  });

  test("detects an in-place dom mutation installed after navigation", async ({ page }) => {
    await page.goto("/");
    await installDomRevisionTracker(page);
    const before = await getDomRevision(page);

    await page.evaluate(() => {
      const marker = document.createElement("div");
      marker.id = "late-mutation-marker";
      marker.textContent = "mutated";
      document.body.appendChild(marker);
    });

    await expect
      .poll(async () => (await getDomRevision(page)).mutations)
      .toBeGreaterThan(before.mutations);
    expect((await getDomRevision(page)).navigations).toBe(before.navigations);
  });

  test("detects a page navigation", async ({ page }) => {
    await installDomRevisionTracker(page);
    await page.goto("/");
    const before = await getDomRevision(page);

    await page.goto("/iframe");

    await expect
      .poll(async () => (await getDomRevision(page)).navigations)
      .toBeGreaterThan(before.navigations);
  });

  test("detects an iframe navigation", async ({ page }) => {
    await installDomRevisionTracker(page);
    await page.goto("/iframe");
    const before = await getDomRevision(page);

    await page.evaluate(() => {
      const frame = document.getElementById("child-frame") as HTMLIFrameElement;
      frame.src = "/frame-child?step=2";
    });

    await expect
      .poll(async () => (await getDomRevision(page)).navigations)
      .toBeGreaterThan(before.navigations);
  });
});
