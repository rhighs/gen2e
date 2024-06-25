import { loadImageWithLabel } from "../../src/image";
import fs from "fs";
import Jimp from "jimp";

jest.mock("fs", () => ({
  promises: {
    readFile: jest.fn(),
  },
}));

jest.mock("jimp", () => ({
  read: jest.fn(),
  loadFont: jest.fn(),
  FONT_SANS_32_BLACK: "FONT_SANS_32_BLACK",
  MIME_JPEG: "image/jpeg",
}));

describe("loadImageWithLabel", () => {
  const mockedReadFile = fs.promises.readFile as jest.Mock;
  const mockedJimpRead = Jimp.read as jest.Mock;
  const mockedLoadFont = Jimp.loadFont as jest.Mock;
  const mockJimpInstance = {
    print: jest.fn().mockReturnThis(),
    getBufferAsync: jest.fn(),
    writeAsync: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should read the image file from the given path", async () => {
    const mockBuffer = Buffer.from("image data");
    mockedReadFile.mockResolvedValue(mockBuffer);
    mockedJimpRead.mockResolvedValue(mockJimpInstance);
    mockedLoadFont.mockResolvedValue("mockFont");
    mockJimpInstance.getBufferAsync.mockResolvedValue(mockBuffer);
    mockJimpInstance.writeAsync.mockResolvedValue(undefined);

    const result = await loadImageWithLabel("test/path.jpg", "Test Label");

    expect(mockedReadFile).toHaveBeenCalledWith("test/path.jpg");
    expect(result).toBe(mockBuffer);
  });

  it("should add label to the image", async () => {
    const mockBuffer = Buffer.from("image data");
    const label = "Test Label";
    mockedReadFile.mockResolvedValue(mockBuffer);
    mockedJimpRead.mockResolvedValue(mockJimpInstance);
    mockedLoadFont.mockResolvedValue("mockFont");
    mockJimpInstance.getBufferAsync.mockResolvedValue(mockBuffer);
    mockJimpInstance.writeAsync.mockResolvedValue(undefined);

    await loadImageWithLabel("test/path.jpg", label);

    expect(mockedJimpRead).toHaveBeenCalledWith(mockBuffer);
    expect(mockedLoadFont).toHaveBeenCalledWith(Jimp.FONT_SANS_32_BLACK);
    expect(mockJimpInstance.print).toHaveBeenCalledWith(
      "mockFont",
      10,
      10,
      label
    );
  });

  it("should write the labeled image to a new file", async () => {
    const mockBuffer = Buffer.from("image data");
    const label = "Test Label";
    const expectedFileName = "test_label.jpg";
    mockedReadFile.mockResolvedValue(mockBuffer);
    mockedJimpRead.mockResolvedValue(mockJimpInstance);
    mockedLoadFont.mockResolvedValue("mockFont");
    mockJimpInstance.getBufferAsync.mockResolvedValue(mockBuffer);
    mockJimpInstance.writeAsync.mockResolvedValue(undefined);

    await loadImageWithLabel("test/path.jpg", label);

    expect(mockJimpInstance.writeAsync).toHaveBeenCalledWith(expectedFileName);
  });
});
