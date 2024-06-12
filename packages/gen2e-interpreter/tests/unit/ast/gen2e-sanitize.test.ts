import { gen2eSanitize } from "../../../src";

describe("gen2eSanitize", () => {
  test("should sanitize gen calls correctly", () => {
    const sourceCode = `\
test('example test',
  gen.test(async ({ page, gen }) => {
    await gen('task 1', { page, test });
    const result = await gen('task 2', { page, test });
    await someOtherFunction();
    await expect(gen('task 3', { page, test })).resolves.toBe(true);
  })
);`;

    const sanitizedCode = `\
test('example test',
  gen.test(async ({ page, gen }) => {
    await gen('task 1', { page, test });
    const result = await gen('task 2', { page, test });
  })
);`;
    const result = gen2eSanitize(sourceCode);
    expect(result).toBe(sanitizedCode);
  });

  test("should throw an error for gen calls as arguments to other call expressions", () => {
    const sourceWithInvalidCall = `\
test('example test',
  gen.test(async ({ page, gen }) => {
    expect(await gen('task 1', { page, test })).toBe(true);
  })
);`;
    expect(() => gen2eSanitize(sourceWithInvalidCall)).toThrow(
      expect.any(Error)
    );
  });

  test("should handle empty source code", () => {
    const result = gen2eSanitize("");
    expect(result).toBe("");
  });

  test("should remove strange nested calls even if those contain gen calls (FIXME)", () => {
    const sourceWithNestedFunctions = `\
test('nested function test',
  gen.test(async ({ page, gen }) => {
    const nestedFunction = async () => {
      await gen('task 1', { page, test });
    };
    await nestedFunction();
    const result = await gen('task 2', { page, test });
    await someOtherFunction();
    await expect(gen('task 3', { page, test })).resolves.toBe(true);
  })
);`;
    const sanitizedWithNestedFunctions = `\
test('nested function test',
  gen.test(async ({ page, gen }) => {
    const nestedFunction = async () => {
        await gen('task 1', { page, test });
    };
    await nestedFunction();
    const result = await gen('task 2', { page, test });
  })
);`;
    const result = gen2eSanitize(sourceWithNestedFunctions);
    expect(result).not.toBe(sanitizedWithNestedFunctions);
  });

  test("should handle gen calls in different indentation styles", () => {
    const sourceWithDifferentIndentation = `\
test('indentation test',
  gen.test(async ({ page, gen }) => {
    await gen('task 1', { page, test });
    const result = await gen('task 2', { page, test });
    await someOtherFunction();
    await expect(gen('task 3', { page, test })).resolves.toBe(true);
  })
);`;
    const sanitizedWithDifferentIndentation = `\
test('indentation test',
  gen.test(async ({ page, gen }) => {
    await gen('task 1', { page, test });
    const result = await gen('task 2', { page, test });
  })
);`;
    const result = gen2eSanitize(sourceWithDifferentIndentation);
    expect(result).toBe(sanitizedWithDifferentIndentation);
  });

  test("should handle gen calls with template literals", () => {
    const sourceWithTemplateLiterals = `\
test('template literal test',
  gen.test(async ({ page, gen }) => {
    await gen(\`task \${1}\`, { page, test });
    const result = await gen(\`task \${2}\`, { page, test });
    await someOtherFunction();
    await expect(gen(\`task \${3}\`, { page, test })).resolves.toBe(true);
  })
);`;
    const sanitizedWithTemplateLiterals = `\
test('template literal test',
  gen.test(async ({ page, gen }) => {
    await gen(\`task \${1}\`, { page, test });
    const result = await gen(\`task \${2}\`, { page, test });
  })
);`;
    const result = gen2eSanitize(sourceWithTemplateLiterals);
    expect(result).toBe(sanitizedWithTemplateLiterals);
  });

  test("should handle gen calls with varying argument types", () => {
    const sourceWithVaryingArguments = `\
test('varying argument test',
  gen.test(async ({ page, gen }) => {
    await gen('task 1', { page, test });
    const result = await gen('task 2', { page, test });
    await gen('task 3', { page, test, extra: true });
    await someOtherFunction();
    await expect(gen('task 4', { page, test })).resolves.toBe(true);
  })
);`;
    const sanitizedWithVaryingArguments = `\
test('varying argument test',
  gen.test(async ({ page, gen }) => {
    await gen('task 1', { page, test });
    const result = await gen('task 2', { page, test });
    await gen('task 3', { page, test, extra: true });
  })
);`;
    const result = gen2eSanitize(sourceWithVaryingArguments);
    expect(result).toBe(sanitizedWithVaryingArguments);
  });

  test("should handle gen calls inside conditionals", () => {
    const sourceWithConditionals = `\
test('conditional test',
  gen.test(async ({ page, gen }) => {
    if (true) {
      await gen('task 1', { page, test });
    }
    const result = await gen('task 2', { page, test });
    await someOtherFunction();
    await expect(gen('task 3', { page, test })).resolves.toBe(true);
  })
);`;
    const sanitizedWithConditionals = `\
test('conditional test',
  gen.test(async ({ page, gen }) => {
    if (true) {
      await gen('task 1', { page, test });
    }
    const result = await gen('task 2', { page, test });
  })
);`;
    const result = gen2eSanitize(sourceWithConditionals);
    expect(result).toBe(sanitizedWithConditionals);
  });
});
