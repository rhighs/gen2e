import { existsSync, mkdirSync, readFile, writeFile } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { BASE_STATIC_PATH } from "../static";
import type { IOWriter, StaticData } from "./interface";

const FILES_DIR = path.join(BASE_STATIC_PATH, "data");

const writeFileAsync = promisify(writeFile);
const readFileAsync = promisify(readFile);

export const FSWriter: IOWriter = {
  read: async (filename: string, dir: string = FILES_DIR): Promise<StaticData | undefined> => {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const fp = path.join(dir, filename);
    try {
      const contents = await readFileAsync(fp);
      return contents.toString();
    } catch (_err) {
      return undefined;
    }
  },

  write: async (filename: string, data: StaticData, dir: string = FILES_DIR): Promise<string> => {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const fp = path.join(dir, filename);
    await writeFileAsync(fp, data);
    return fp;
  },
};
