import { expect, test } from "@playwright/test";
import { gen, stepLoggingEnabled } from "../../src";
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
