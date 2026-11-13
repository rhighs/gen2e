import { describe, expect, test } from "bun:test";
import { findForbiddenJS, sanitizeCodeOutput, validateJSCode, validateJSONString } from "../../src";

describe("sanitizeCodeOutput", () => {
  test.each([
    ["```\nconst a = 1;\n```", "const a = 1;"],
    ["```typescript\nlet x: number = 10;\n```", "let x: number = 10;"],
    ["```javascript\nlet y = 'hello';\n```", "let y = 'hello';"],
    ["```ts\nconsole.log('hi');\n```\n", "console.log('hi');"],
    ["```js\n\nconsole.log('hi');\n\n```\n", "console.log('hi');"],
    ["text before the block:\n```js\nconsole.log('hi');\n```\n", "console.log('hi');"],
    ["await page.click('#go')", "await page.click('#go')"],
  ])("%p becomes %p", (input, expected) => {
    expect(sanitizeCodeOutput(input)).toBe(expected);
  });
});

describe("validateJSCode", () => {
  test("accepts top-level await inside the async wrapper", () => {
    expect(validateJSCode("await page.click('#go'); return 1;")).toBe(true);
  });

  test("rejects code that does not parse", () => {
    expect(validateJSCode("let x == 10;")).toBe(false);
  });
});

describe("validateJSONString", () => {
  test.each([
    ['{"name": "John"}', true],
    ['{"name": "John",}', false],
    ["", false],
  ])("%p is %p", (input, expected) => {
    expect(validateJSONString(input)).toBe(expected);
  });
});

describe("findForbiddenJS", () => {
  test.each([
    ["process.env.SECRET", "process"],
    ["require('fs')", "require"],
    ["globalThis.fetch('x')", "globalThis"],
    ["new Function('return 1')()", "Function"],
    ["page.constructor.constructor('return this')()", "constructor"],
    ["page['constructor']", "constructor"],
  ])("flags %s", (code, name) => {
    expect(findForbiddenJS(code)).toBe(name);
  });

  test("accepts ordinary Playwright code", () => {
    expect(
      findForbiddenJS(
        "await page.locator('#a').click(); return await page.evaluate(() => document.title)",
      ),
    ).toBeUndefined();
  });
});
