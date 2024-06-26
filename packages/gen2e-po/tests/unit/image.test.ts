import { loadImageWithLabel } from "../../src/image";
import Jimp from "jimp";
import fs from "fs";

jest.mock("fs", () => ({
  promises: {
    readFile: jest.fn(),
  },
}));

jest.mock("jimp", () => ({
  read: jest.fn(),
  loadFont: jest.fn(),
  FONT_SANS_32_BLACK: "path/to/font",
  MIME_JPEG: "image/jpeg",
}));

describe("loadImageWithLabel", () => {
  const mockedReadFile = fs.promises.readFile as jest.MockedFunction<
    typeof fs.promises.readFile
  >;
  const mockedJimpRead = Jimp.read as jest.MockedFunction<typeof Jimp.read>;
  const mockedJimpLoadFont = Jimp.loadFont as jest.MockedFunction<
    typeof Jimp.loadFont
  >;

  it("should load an image, label it, and return a buffer", async () => {
    const sampleImagePath = "path/to/sample.jpg";
    const sampleLabel = "Sample Label";
    const sampleImageBuffer = Buffer.from("sample image buffer");

    mockedReadFile.mockResolvedValue(sampleImageBuffer);

    const mockJimpInstance = {
      print: jest.fn().mockReturnThis(),
      getBufferAsync: jest.fn().mockResolvedValue(sampleImageBuffer),
    };
    mockedJimpRead.mockResolvedValue(mockJimpInstance as any);

    mockedJimpLoadFont.mockResolvedValue("mocked-font" as any);

    const result = await loadImageWithLabel(sampleImagePath, sampleLabel);

    expect(mockedReadFile).toHaveBeenCalledWith(sampleImagePath);
    expect(mockedJimpRead).toHaveBeenCalledWith(sampleImageBuffer);
    expect(mockedJimpLoadFont).toHaveBeenCalledWith(Jimp.FONT_SANS_32_BLACK);
    expect(mockJimpInstance.print).toHaveBeenCalledWith(
      "mocked-font",
      10,
      10,
      sampleLabel
    );
    expect(mockJimpInstance.getBufferAsync).toHaveBeenCalledWith(
      Jimp.MIME_JPEG
    );
    expect(result).toBe(sampleImageBuffer);
  });

  it("should throw an error if readFile fails", async () => {
    const sampleImagePath = "path/to/sample.jpg";
    const sampleLabel = "Sample Label";

    mockedReadFile.mockRejectedValue(new Error("File not found"));

    await expect(
      loadImageWithLabel(sampleImagePath, sampleLabel)
    ).rejects.toThrow("File not found");
  });
});
