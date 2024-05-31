import { gen2eSanitize } from "../../../src";

describe("gen2eSanitize", () => {
  const sourceCode = `\
test('example test',
    gen.test(async ({ page, gen }) => {
        await gen('task 1', { page, test });
        const result = await gen('task 2', { page, test });
        await someOtherFunction();
        await expect(gen('task 3', { page, test })).resolves.toBe(true);
    })
);
  `;

  const sanitizedCode = `\
test('example test',
    gen.test(async ({ page, gen }) => {
        await gen('task 1', { page, test });
        const result = await gen('task 2', { page, test });
    })
);
  `;

  test("should sanitize gen calls correctly", () => {
    const result = gen2eSanitize(sourceCode);
    expect(result).toBe(sanitizedCode);
  });

  test("should throw an error for gen calls as arguments to other call expressions", () => {
    const sourceWithInvalidCall = `\
test('example test',
    gen.test(async ({ page, gen }) => {
        expect(await gen('task 1', { page, test })).toBe(true);
    })
);
    `;
    expect(() => gen2eSanitize(sourceWithInvalidCall)).toThrow(
      expect.any(Error)
    );
  });

  test("should handle empty source code", () => {
    const result = gen2eSanitize("");
    expect(result).toBe("");
  });
});
