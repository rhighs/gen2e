import { expect, test } from "@playwright/test";
import { gen, stepLoggingEnabled } from "../src";
stepLoggingEnabled(true);

test.beforeEach(async ({ page }) => {
  await page.goto("http://127.0.0.1:9999/");
});

test(
  "executes query",
  gen.test(async ({ page, gen }) => {
    const headerText = await gen("get the header text", { page, test });
    expect(headerText).toBe("Hello, Gen2E!");
  })
);

test(
  "executes query, but adding a simple operation on the target data",
  gen.test(async ({ page, gen }) => {
    const headerText = await gen("get the first letter of the header text", {
      page,
      test,
    });
    expect(headerText).toBe("H");
  })
);

test(
  "executes a simple action, filling a search box",
  gen.test(async ({ page, gen }) => {
    await gen(`Type "foo" in the search box`, { page, test });
    await page.pause();
    await expect(page.getByTestId("search-input")).toHaveValue("foo");
  })
);

test(
  "executes click, incrementing a counter",
  gen.test(async ({ page, gen }) => {
    await gen("Click the button until the counter value is equal to 2", {
      page,
      test,
    });
    const count = await gen("Get the count number in click count:", {
      page,
      test,
    });
    await expect(parseInt(count)).toBe(2);
  })
);

test(
  "asserts (toBe), query by question and get a boolean result",
  gen.test(async ({ page, gen }) => {
    const searchInputHasHeaderText = await gen(
      `Is the contents of the header equal to "Hello, Gen2E!"?`,
      { page, test }
    );
    expect(searchInputHasHeaderText).toBe(true);
  })
);

test(
  "asserts (not.toBe), asserting a wrong header value",
  gen.test(async ({ page, gen }) => {
    const searchInputHasHeaderText = await gen(
      `Is the contents of the header equal to "Flying Donkeys"?`,
      { page, test }
    );
    expect(searchInputHasHeaderText).toBe(false);
  })
);

test(
  "executes query, action and assertion",
  gen.test(async ({ page, gen }) => {
    const headerText = await gen("get the header text", { page, test });
    await gen(`type "${headerText}" in the search box`, { page, test });

    const searchInputHasHeaderText = await gen(
      `is the contents of the search box equal to "${headerText}"?`,
      { page, test }
    );

    expect(searchInputHasHeaderText).toBe(true);
  })
);

test(
  "runs without test parameter",
  gen.test(async ({ page, gen }) => {
    test.slow();
    const headerText = await gen("get the header text", { page, test });
    expect(headerText).toBe("Hello, Gen2E!");
  })
);


test(
  "gen2e:compiled-output - gen2e - interpreter gen",
  async (
    {
      page
    }
  ) => {
    const GEN2E_CALLS_TIMEOUT = 300000;
    test.setTimeout(GEN2E_CALLS_TIMEOUT);
await (async () => { await page.goto('https://prolocal.mywellness.com:12443/auth/login') })();
await (async () => { await page.waitForLoadState('networkidle') })();
await (async () => { await page.locator('input[type="email"]').last().fill('runner@e2e.it') })();
await (async () => { await page.locator('#password').last().fill('tgsTGS123') })();
const usernameHelperText = await (async () => { const value = await page.locator('#username-helper-text').last().innerText(); return value })();
expect(usernameHelperText).not.toMatch(/[a-zA-Z]/);
const passwordHelperText = await (async () => { const value = await page.locator('#password-helper-text').last().textContent()
return value })();
expect(passwordHelperText).not.toMatch(/[a-zA-Z]/);
await (async () => { await page.locator('button[name="loginButton"]').last().click() })();
await (async () => { await page.locator('text="Test Automation single club"').last().click() })();
await (async () => { await page.locator('#automation').last().click() })();
await (async () => { await page.locator('#automationCampaigns').last().click() })();
await (async () => { await page.locator('[data-testid="create-campaign-action"]').last().click() })();
await (async () => { await page.waitForTimeout(2000) })();
await (async () => { await page.locator('div:has-text("Notifica push")').last().click() })();
await (async () => { await page.locator('text="Crea"').last().click() })();
await (async () => { await page.waitForTimeout(1000) })();
await (async () => { await page.waitForLoadState('networkidle') })();
await (async () => { await page.locator('text="Salva"').last().click() })();
})