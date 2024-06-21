import { Gen2ERecordingDump } from "@rhighs/gen2e-interpreter";
import fs from "fs";
import path from "path";
const { readFile, readdir } = fs.promises;

const DUMPS_DATA_PATH: string = path.join(process.cwd(), "dumps");

const findDumps = async (dir: string = "./dumps"): Promise<string[]> =>
  await readdir(dir, { recursive: true }).then((result) =>
    result
      .filter((path) => path.match(/gen2e-dump_.*\.json/))
      .map((p) => path.join(dir, p))
  );

const parseDump = async (filePath: string): Promise<Gen2ERecordingDump> =>
  JSON.parse((await readFile(filePath)).toString());

export const loadDumps = async () =>
  findDumps(DUMPS_DATA_PATH).then((dumps) =>
    Promise.all(dumps.map((d) => parseDump(d)))
  );

export const pageObjectsDir = async (dir: string): Promise<string[]> =>
  await readdir(dir, { recursive: true }).then((result) =>
    result
      .filter((path) => path.match(/.*gen2e-po\.ts/))
      .map((p) => path.join(dir, p))
  );