import { evalGen2EExpression } from "../../../src";
import { Page } from "@rhighs/gen2e";

describe("evalGen2EExpression", () => {
  const mockGen = jest.fn();
  const mockPage = {};

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("should evaluate the given gen expression successfully", async () => {
    const genExpr = "await gen('task', { page });";
    const mockGenImplementation = async () => Promise.resolve();
    mockGen.mockImplementation(mockGenImplementation);

    await evalGen2EExpression(genExpr, mockGen, mockPage as Page);

    expect(mockGen).toHaveBeenCalledWith("task", { page: mockPage });
  });

  test("should handle evaluation errors gracefully", async () => {
    const genExpr =
      "await gen('task', { page }); throw new Error('Test error');";
    const mockGenImplementation = async () => Promise.resolve();
    mockGen.mockImplementation(mockGenImplementation);

    await evalGen2EExpression(genExpr, mockGen, mockPage as Page);

    expect(mockGen).toHaveBeenCalledWith("task", { page: mockPage });
  });

  test("should not evaluate if page is null", async () => {
    const genExpr = "await gen('task', { page });";
    const nullPage = null;

    await evalGen2EExpression(genExpr, mockGen, nullPage as unknown as Page);

    expect(mockGen).not.toHaveBeenCalled();
  });
});
