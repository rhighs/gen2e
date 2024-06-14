import path from "path";
import { IOWriter, StaticData } from "./interface";
import { existsSync, mkdirSync, readFile, writeFile } from "fs";
import { BASE_STATIC_PATH } from "../static";
import { promisify } from "util";

const FILES_DIR = path.join(BASE_STATIC_PATH, "data");

const writeFileAsync = promisify(writeFile);
const readFileAsync = promisify(readFile);

export const FSWriter: IOWriter = {
  read: async (
    filename: string,
    dir: string = FILES_DIR
  ): Promise<StaticData | undefined> => {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const fp = path.join(dir, filename);
    try {
      const contents = await readFileAsync(fp);
      return contents.toString();
    } catch (err) {
      return undefined;
    }
  },

  write: async (
    filename: string,
    data: StaticData,
    dir: string = FILES_DIR
  ): Promise<void> => {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const fp = path.join(dir, filename);
    return await writeFileAsync(fp, data, {
      flag: "wx",
    });
  },
};
