# Gen2E aka Gen-To-End

Run and generate Playwright tests using LLMs.

## Setup

1. Install `@rhighs/gen2e` dependency:

```bash
npm install @rhighs/gen2e -D
```

2. This package relies on talking with OpenAI (https://openai.com/). You must export the API token as an enviroment variable or add it to your `.env` file:

```bash
export OPENAI_API_KEY='sk-..."
```

3. Import and use the `gen` function:

```ts
import { test, expect } from "@playwright/test";
import { gen } from "gen-playwright";

test("gen Playwright example", async ({ page }) => {
  await page.goto("/");

  // `gen` can query data
  // In this case, the result is plain-text contents of the header
  const headerText = await gen("get the header text", { page, test });

  // `gen` can perform actions
  // In this case, gen will find and fill in the search text input
  await gen(`Type "${headerText}" in the search box`, { page, test });

  // `gen` can assert the state of the website
  // In this case, the result is a boolean outcome
  const searchInputHasHeaderText = await gen(`Is the contents of the search box equal to "${headerText}"?`, { page, test });

  expect(searchInputHasHeaderText).toBe(true);
});
```

## Environment variables

### Example .env file

```
GEN2E_PRELOAD_ENABLED=true
GEN2E_STATIC_PATH=<static-files-dir>
GEN2E_DEBUG_AST=true
GEN2E_SV_LOG_ERR=true
GEN2E_DBG=true
GEN2E_DEFAULT_MODEL=gpt-4o-2024-05-13
GEN2E_STEP_LOG=true
OPENAI_API_KEY=<your-api-key>
```

### Gen2E Library
- **GEN2E_PRELOAD_ENABLED**
  determines if preloading is enabled for the gen2e static fs file store.

- **GEN2E_STATIC_PATH**
  specifies the path to generated static files, defaults to a `.static` dir in the current working directory if not set.

- **GEN2E_DEBUG_AST**
  enables debug logging for AST utility operations within gen2e.

- **GEN2E_SV_LOG_ERR**
  enables logging of errors specifically for the script versioning in gen2e.

- **GEN2E_DBG**
  enables debug mode for the gen2e lib.

- **GEN2E_DEFAULT_MODEL**
  sets the default model used by gen2e, with a fallback to "gpt-4o-2024-05-13" if not specified.

- **GEN2E_STEP_LOG**
  enables step-by-step logging in the gen2e process, useful for detailed tracing.


## Usage

### Browser genmation

***TODO***

### Debug

***TODO***

## Options and configuration

***TODO***

## Actions and possible return values
Depending on the `type` of action (inferred by the `gen` function), there are different behaviors and return types.

### Action
An action (e.g. "click") is some simulated user interaction with the page, e.g. a click on a link. Actions will return `undefined`` if they were successful and will throw an error if they failed, e.g.

```ts
try {
  await gen("click the link", { page, test });
} catch (e) {
  console.error("failed to click the link");
}
```

### Query
A query will return requested data from the page as a string, e.g.

```ts
const linkText = await gen("Get the text of the first link", { page, test });

console.log("The link text is", linkText);
```

### Assert

An assertion is a question that will return `true` or `false`, e.g.

```ts
const thereAreThreeLinks = await gen("Are there 3 links on the page?", {
  page,
  test,
});

console.log(`"There are 3 links" is a ${thereAreThreeLinks} statement`);
```

