import { expect, test } from "@playwright/test";
import gen from "../src";

test(
  "executes query",
  gen.test(async ({ page, gen }) => {
    await page.goto("/");
    const headerText = await gen("get the header text", { page, test });
    expect(headerText).toBe("Hello, Gen2E!");
  })
);

test(
  "executes query, but adding a simple operation on the target data",
  gen.test(async ({ page, gen }) => {
    await page.goto("/");

    const headerText = await gen("get the first letter of the header text", {
      page,
      test,
    });

    // TODO assert that we are using locator_evaluate to get the first letter
    expect(headerText).toBe("H");
  })
);

test(
  "executes a simple action, filling a search box",
  gen.test(async ({ page, gen }) => {
    await page.goto("/");
    await gen(`Type "foo" in the search box`, { page, test });
    await page.pause();
    await expect(page.getByTestId("search-input")).toHaveValue("foo");
  })
);

test(
  "executes click, incrementing a counter",
  gen.test(async ({ page, gen }) => {
    await page.goto("/");
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
    await page.goto("/");

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
    await page.goto("/");

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
    await page.goto("/");
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
    await page.goto("/");
    const headerText = await gen("get the header text", { page, test });
    expect(headerText).toBe("Hello, Gen2E!");
  })
);

test(
  "inputs ciao in the search box, clicks button 10 times, and checks count",
  gen.test(async ({ page, gen }) => {
    test.setTimeout(300000)
    await gen('navigate to the login page https://prolocal.mywellness.com:12443/auth/login', { page, test });
    await gen('wait for network to be idle', { page, test });
    await gen("type 'runner@e2e.it' into the email input field", { page, test });
    await gen("type 'tgsTGS123' into the password input field", { page, test });
    const usernameHelperText = await gen("get the username helper text", { page, test });
    expect(usernameHelperText).not.toMatch(/[a-zA-Z]/);
    const passwordHelperText = await gen("get the password helper text", { page, test });
    expect(passwordHelperText).not.toMatch(/[a-zA-Z]/);
    await gen("click the login button", { page, test });
    await gen("click on Test Automation single club", { page, test });
    await gen("click on the left tab item with id 'automation'", { page, test });
    await gen("click on the Campaign or Campagne item with id 'automationCampaigns'", { page, test });
    await gen("click the button with data-testid 'create-campaign-action'", { page, test });
    await gen("wait for at least two seconds so that the modal appears", { page, test });
    await gen("click the last div with inner text 'Notifica push'", { page, test });
    await gen("click the button that says 'Crea'", { page, test });
    await gen("wait for at least one second", { page, test });
    await gen("wait for network to be idle", { page, test });
    await gen("click the button that says 'Salva'", { page, test });
  })
);
