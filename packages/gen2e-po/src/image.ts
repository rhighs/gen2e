import Jimp from "jimp";

import fs from "fs";
const { readFile } = fs.promises;

export const loadImageWithLabel = async (
  path: string,
  label: string
): Promise<Buffer> => {
  const labelImage = async (label: string, image: Buffer): Promise<Buffer> => {
    const jimage = await Jimp.read(image);
    const font = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
    jimage.print(font, 10, 10, label);
    const buffer = await jimage.getBufferAsync(Jimp.MIME_JPEG);
    await jimage.writeAsync(label.toLowerCase().replace(" ", "_") + ".jpg");
    return buffer;
  };

  const buffer = await readFile(path);
  return labelImage(label, buffer);
};
