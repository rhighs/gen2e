import { TiktokenModel, encoding_for_model } from "tiktoken";
import {
  _MARGIN,
  tokenLimits,
  countTokens,
  countTokenApprox,
  fitsContext,
  maxCharactersApprox,
} from "../../../src/runner";

jest.mock("tiktoken", () => ({
  encoding_for_model: jest.fn(),
}));

describe("Token Utility Functions", () => {
  const mockModel = "test-model" as TiktokenModel;
  const mockText = "This is a test text.";
  const mockEncodedLength = 5;

  beforeEach(() => {
    const mockEncode = {
      encode: jest.fn().mockReturnValue({ length: mockEncodedLength }),
      free: jest.fn(),
    };
    (encoding_for_model as jest.Mock).mockReturnValue(mockEncode);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("countTokens should return correct token count", () => {
    const tokenCount = countTokens(mockModel, mockText);
    expect(encoding_for_model).toHaveBeenCalledWith(mockModel);
    expect(tokenCount).toBe(mockEncodedLength);
  });

  test("countTokenApprox should return approximate token count", () => {
    const approxTokenCount = Math.floor(countTokenApprox(mockText));
    const expectedApprox = Math.floor(mockText.length * (1 / Math.E) + _MARGIN);
    expect(approxTokenCount).toBe(expectedApprox);
  });

  test("fitsContext should return true if text fits within context window", () => {
    const text = "A".repeat(50);

    const mockedLimit = jest
      .fn()
      .mockReturnValue({ context: 100, maxOut: 100 });
    const result = fitsContext(mockModel, text, mockedLimit);

    expect(result).toBe(true);
  });

  test("maxCharactersApprox should return approximate max characters", () => {
    const mockTokenLimits = { context: 100 };
    const mockedLimit = jest
      .fn()
      .mockReturnValue({ context: 100, maxOut: 100 });
    const maxChars = maxCharactersApprox(mockModel, mockedLimit);
    const expectedMaxChars = Math.floor(
      (mockTokenLimits.context - _MARGIN) * Math.E
    );

    expect(Math.floor(maxChars)).toBe(expectedMaxChars);
  });
});
