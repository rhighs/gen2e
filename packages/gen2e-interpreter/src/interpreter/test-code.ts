export const formatBlock = ([task, expr]: [string, string]): string => `\
// task
{
${expr}
}`;

export const generateFakeTestCode = (
  testTitle: string,
  body: string,
  includeTimeout: boolean = true
) => {
  let code = `\
test(
  "${testTitle}",
  gen.test(async ({ page, gen }) => {
    ${
      includeTimeout
        ? `
    // safety timeout block:
    //  this is generated and is put here to ensure all gen calls complete correctly in a somewhat
    //  expected amount of time. if this test block fails due to time constraints feel free
    //  to increase \`GEN2E_CALLS_TIMEOUT\`.
    {
      page.setDefaultTimeout(5000);
      const GEN2E_CALLS_TIMEOUT = 300000;
      test.setTimeout(GEN2E_CALLS_TIMEOUT);
    }
    `
        : ""
    }
`;
  code += body + "\n";
  code += "}))";
  return code;
};
