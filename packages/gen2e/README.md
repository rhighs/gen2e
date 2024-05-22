# Gen2E

Run and generate Playwright tests using LLMs.

## Getting started

1. Installing

```bash
npm install @rhighs/gen2e -D
```

2. This package relies on talking with OpenAI (https://openai.com/). You must export the API token as an enviroment variable or add it to your `.env` file:

```bash
export OPENAI_API_KEY='sk-..."
```

3. Import `gen` and structure a test like this example:

```ts
import { test, expect } from "@playwright/test";
import { gen } from "@rhighs/gen2e";

test("gen playwright example",
  gen.test(async ({ page, gen }) => {
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
  })
);
```

## Usage

Depending on the type of task being prompted there will be three different behaviors and return types: **actions**, **queries** and **assertions**

### Action


```ts
try {
  await gen("click the link", { page, test });
} catch (e) {
  console.error("failed to click the link");
}
```

### Queries

This bahavior manifests whenever our prompt is asking for something, like gathering a page title.

```ts
const pageTitle = await gen("get the page title", { page, test });
expect(pageTitle).toBe("Gen2E")
```

### Assertions

An assertion in this context is a question whose answer must only be yes or no, thus the function
is expected to return either `true` or `false`.

```ts
const thereAreThreeLinks = await gen("are there 3 links on the page?", {
  page,
  test,
});
expect(thereAreThreeLinks).toBe(true)
```

## How it works

gen2e has a main agent whose job is to interpret the task sentiment and generate an atomic playwright expression accordingly. This expression is then sanitized and evaluted dynamically at runtime, if the expression executes successfully it's then cached via something called a "static store", which is nothing more than a fancy term for a cache manager of "static code", code that is not going to change. This code can then be used in subsequent test runs avoiding gen2e having to call it's agent again for a task it has already solved in the past.

### Static stores

A static store is really just a [set of functions](./src/static/store/store.ts) the gen2e library will use to fetch, store (and create unique identifiers) code generated in previous runs for the same task in a test. By default gen2e uses the [`FSStaticStore`](./src/static/store/fs.ts), which will save all generated test code in the file system at location given by env `GEN2E_STATIC_PATH`.

Static stores can be configured; allowing for storage of generated code wherever one wants. It is advised to use a storage strategy that is convinient in terms read/write times.

By default, code is fetched by looking up for a file whose name is the md5 hash of `test_title + task_prompt`; If per say the task name changes, gen2e won't use the same code for that gen2e call instead it will generate a new playwright expression for the task and store it afterwards.

e.g.
```ts
test("go to google, assert the title is set correctly then search for something",
  gen.test(async ({ page, gen }) => {
    await gen("goto google.com", { page, test });
    await gen("click on accept all", { page, test }); 
    const pageTitle = await gen("get the page title", { page, test });
    expect(pageTitle).toBe("Google");
    await gen("type \"funny cats\" in the search bar and then press enter on the keyboard", { page, test });
  })
)
```

Running this the first time will have it take some time due to all 4 agent calls needing to complete in sequence. The second run will be as fast as a plain playwright test because it's code was cached under the hood.

Say we now want to search for "silly dogs" instead of "funny cats".

```ts
test("go to google, assert the title is set correctly then search for something",
  gen.test(async ({ page, gen }) => {
    // all calls in this block use previously cached code
    {
      await gen("goto google.com", { page, test });
      await gen("click on accept all", { page, test }); 
      const pageTitle = await gen("get the page title", { page, test });
      expect(pageTitle).toBe("Google");
    }

    // performs an agent call, this is a new task gen2e has never seen before
    await gen("type \"silly dogs\" in the search bar and then press enter on the keyboard", { page, test });
  })
)
```

This allows incremental test code recompiles (similarly to how statically compiled languages do) if you change a single task directive in a test suite, there's no reason to regenerate all tasks; simply generate the ones that changed.

### Using custom static stores

A static store can be passed in for a whole test case by setting it in the gen.test's init params, here an example storing code in an in-memory js object:

```ts
const inMemStatic = {}

test("go to google, assert the title is set correctly then search for something",
  gen.test(async ({ page, gen }) => {
    await gen("goto google.com", { page, test });
    await gen("click on accept all", { page, test }); 
    const pageTitle = await gen("get the page title", { page, test });
    expect(pageTitle).toBe("Google");
    await gen(
      "type \"silly dogs\" in the search bar and then press enter on the keyboard",
      { page, test }
    );
  }, {
    store: {
      makeStatic: (testTitle: string, task: string) => `${testTitle} - ${task}`
      fetchStatic: (ident: string) => inMemStatic[ident],
      makeStatic: (content: StaticGenStep) => (inMemStatic[content.ident] = content.expression),
    }
  })
)
```

### Configuring a different model per gen call

This is used when a task we have to perform is relatively simple and needs little to no html context, in the case we might want to opt in with a gpt-3.5-turbo call instead of using a bigger/slower/costier model:

```ts
test("go to google and do something",
  gen.test(async ({ page, gen }) => {
    await gen("goto google.com", { page, test }, { model: 'gpt-3.5-turbo' });
    ...
  })
)
```

### Disable/enable static stores

At the time of writing; this is the most convenient option and will likely see a refactor in future implementations:

```ts
import { gen } from "@rhighs/gen2e";

gen.useStatic = false
{
  test("go to google and do something",
    gen.test(async ({ page, gen }) => {
      await gen("goto google.com", { page, test });
      ...
    })
  )
}
gen.useStatic = true

```

## Environment variables
```
# enables logging for the code validation step in agent calls
GEN2E_SV_LOG_ERR=0

# determines if preloading is enabled for the gen2e static fs file store
GEN2E_PRELOAD_ENABLED

# specifies the path to generated static files, defaults to a `.static` dir in the current working directory if not set
GEN2E_STATIC_PATH=

# enables debug mode, logs more stuff
GEN2E_DBG=1

# sets the default model used by gen2e, with a fallback to "gpt-4o-2024-05-13" if not specified
GEN2E_MODEL="gpt-3.5-turbo"

# enables step-by-step logging in the gen2e process
GEN2E_LOG_STEP=0

# whether to use static stores or not, true by default
GEN2E_USE_STATIC_STORE=1

OPENAI_API_KEY=<your-api-key>
```
