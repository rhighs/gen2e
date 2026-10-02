import { existsSync, mkdirSync, readFile, writeFile } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { staticBasePath } from "../static";
import type { IOWriter, StaticData } from "./interface";

const filesDir = (): string => path.join(staticBasePath(), "data");

const writeFileAsync = promisify(writeFile);
const readFileAsync = promisify(readFile);

export const FSWriter: IOWriter = {
  read: async (filename: string, dir: string = filesDir()): Promise<StaticData | undefined> => {
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

  write: async (filename: string, data: StaticData, dir: string = filesDir()): Promise<string> => {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const fp = path.join(dir, filename);
    await writeFileAsync(fp, data);
    return fp;
  },
};
