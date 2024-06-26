import { Gen2EPOCodeAPI, Gen2EPageObjectFileContents } from "../types";
import { pageObjectsInfo } from "@rhighs/gen2e-interpreter";

import fs from "fs";
import path from "path";
const { mkdir, rm, writeFile, readFile, readdir, stat } = fs.promises;

const findSrcFiles = async (
  dir: string,
  regex: RegExp = /.*/,
  ignoreDirs: string[] = [".git", "node_modules"]
): Promise<string[]> => {
  const ds = await stat(dir);
  if (!ds.isDirectory) {
    return [dir];
  }

  const dirents = await readdir(dir, { withFileTypes: true })
    .then((dirents) =>
      Promise.all(
        dirents.map(async (dirent): Promise<string[]> => {
          if (!ignoreDirs.includes(dirent.name)) {
            const resource = path.resolve(dir, dirent.name);
            if (dirent.isDirectory()) {
              return findSrcFiles(resource, regex, ignoreDirs);
            } else if (regex.test(resource)) {
              return [resource];
            }
          }
          return [];
        })
      )
    )
    .then((results) => results.flat());

  return dirents;
};

const findPageObjectsSourceFiles = async (dir: string): Promise<string[]> =>
  findSrcFiles(dir, /.*\.gen2e-po\.ts/);

const findPageObjects = async (
  from: string = process.cwd()
): Promise<Gen2EPageObjectFileContents[]> => {
  const pageObjectFiles = await findPageObjectsSourceFiles(from);
  const sourceMap = await Promise.all(
    pageObjectFiles.map((file) =>
      readFile(file)
        .then((c) => c.toString())
        .then((source) => ({
          filename: file,
          source,
        }))
        .then(({ filename, source }) => ({
          filename,
          source,
          objects: pageObjectsInfo(source),
        }))
    )
  );
  return sourceMap;
};

const createPageObject = async (filepath: string, source: string) => {
  if (!filepath.endsWith(".gen2e-po.ts")) {
    if (filepath.slice(filepath.length - 3) == ".ts") {
      filepath = filepath.slice(0, filepath.length - 3) + ".gen2e-po.ts";
    } else {
      filepath += ".gen2e-po.ts";
    }
  }

  const dirpath = path.dirname(filepath);
  await mkdir(dirpath, { recursive: true });

  let scopedSource = `${source}`;
  if (!scopedSource.includes("import { Page }")) {
    scopedSource = `\
import { Page } from "@playwright/test"
${scopedSource}`;
  }
  await writeFile(filepath, scopedSource);
};

export const FSCodeAPI: Gen2EPOCodeAPI = {
  find: (dir: string = process.cwd()): Promise<string[]> =>
    readdir(dir, { recursive: true }).then((result) =>
      result
        .filter((path) => path.match(/.*gen2e-po\.ts/))
        .map((p) => path.join(dir, p))
    ),
  list: (): Promise<Gen2EPageObjectFileContents[]> => findPageObjects(),
  rm: (filepath: string): Promise<void> => rm(filepath),
  touch: (filepath: string, source: string): Promise<void> =>
    createPageObject(filepath, source),
};
