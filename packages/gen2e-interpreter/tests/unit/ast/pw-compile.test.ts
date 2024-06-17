import { pwCompile } from "../../../src";
import { StaticStore } from "@rhighs/gen2e";

const inMemoryStatic: { [key: string]: string } = {};
const staticStore: StaticStore = {
  makeIdent: (title, task) => `gen2.interpreter - [${title}](${task})`,
  fetchStatic: (ident: string) => ({
    ident,
    expression: inMemoryStatic[ident],
  }),
  makeStatic: (ident, content) => {
    inMemoryStatic[ident] = content.expression;
  },
};

describe("pwCompile", () => {
  beforeEach(() => {
    for (const key in inMemoryStatic) {
      delete inMemoryStatic[key];
    }
  });

  test('should replace gen("<task>", { page, test }) with static Playwright expressions', () => {
    const sourceCode = `\
test('example test', async () => {
  await gen('task 1', { page, test });
});`;

    const ident = staticStore.makeIdent("example test", "task 1");
    const staticCode = "async () => { /* static code */ }";
    staticStore.makeStatic(ident, {
      expression: staticCode,
    });

    const result = pwCompile(sourceCode, staticStore);
    expect(result).toContain(staticCode);
    expect(result).toContain("gen2e:compiled-output - example test");
  });

  test("should replace gen.test(({ page, gen }) => { ... }) with native Playwright test expressions", () => {
    const sourceCode = `\
test(
    gen.test(async ({ page, gen }) => {
        await page.goto('https://example.com');
    })
);
    `;

    const result = pwCompile(sourceCode, staticStore);

    const expectedOutput = `
test(
    async ({ page }) => {
        await page.goto('https://example.com');
    }
);
    `;

    expect(result.replace(/\s+/g, "")).toBe(expectedOutput.replace(/\s+/g, ""));
  });

  test("should handle empty source code", () => {
    const result = pwCompile("", staticStore);
    expect(result).toBe("");
  });

  test("should handle source code with no relevant gen calls", () => {
    const sourceWithNoGenCalls = `\
test('example test', async () => {
  await someOtherFunction();
});`;
    const result = pwCompile(sourceWithNoGenCalls, staticStore);
    expect(result).toBe(sourceWithNoGenCalls);
  });
});
