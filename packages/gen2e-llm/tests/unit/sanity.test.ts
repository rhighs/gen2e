import { describe, expect, test } from "bun:test";
import { sanitizeCodeOutput, validateJSCode, validateJSONString } from "../../src";

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
