import { sanitizeCodeOutput, validateJSCode } from "../../src";
import * as esprima from "esprima";

describe("sanitizeCodeOutput", () => {
  it("should remove generic markdown code block tokens", () => {
    const input = "```\nconst a = 1;\n```";
    const expectedOutput = "const a = 1;";
    expect(sanitizeCodeOutput(input)).toBe(expectedOutput);
  });

  it("should remove TypeScript code block tokens", () => {
    const input = "```typescript\nlet x: number = 10;\n```";
    const expectedOutput = "let x: number = 10;";
    expect(sanitizeCodeOutput(input)).toBe(expectedOutput);
  });

  it("should remove JavaScript code block tokens", () => {
    const input = "```javascript\nlet y = 'hello';\n```";
    const expectedOutput = "let y = 'hello';";
    expect(sanitizeCodeOutput(input)).toBe(expectedOutput);
  });

  it("should remove trailing new line after markdown block tokens", () => {
    const input = "```ts\nconsole.log('Hello World');\n```\n";
    const expectedOutput = "console.log('Hello World');";
    expect(sanitizeCodeOutput(input)).toBe(expectedOutput);
  });

  it("should remove multiple leading and trailing new lines", () => {
    const input = "```js\n\nconsole.log('Hello World');\n\n```\n";
    const expectedOutput = "console.log('Hello World');";
    expect(sanitizeCodeOutput(input)).toBe(expectedOutput);
  });
});

jest.mock("esprima", () => ({
  parseScript: jest.fn(),
}));

describe("validateJSCode", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return true for valid JavaScript code", () => {
    const code = "let x = 10;";
    (esprima.parseScript as jest.Mock).mockImplementation(() => {});
    const result = validateJSCode(code);
    expect(result).toBe(true);
    expect(esprima.parseScript).toHaveBeenCalledWith(`(async () => {${code}})`);
  });

  it("should return false for invalid JavaScript code", () => {
    const code = "let x == 10;";
    const error = new Error("Unexpected token");
    (esprima.parseScript as jest.Mock).mockImplementation(() => {
      throw error;
    });
    const result = validateJSCode(code);
    expect(result).toBe(false);
    expect(esprima.parseScript).toHaveBeenCalledWith(`(async () => {${code}})`);
  });
});
