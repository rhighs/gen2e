import { readFile } from "node:fs/promises";
import { Jimp, loadFont } from "jimp";
import { SANS_32_BLACK } from "jimp/fonts";

export const loadImageWithLabel = async (path: string, label: string): Promise<Buffer> => {
  const image = await Jimp.read(await readFile(path));
  const font = await loadFont(SANS_32_BLACK);
  image.print({ font, x: 10, y: 10, text: label });
  return image.getBuffer("image/jpeg");
};
