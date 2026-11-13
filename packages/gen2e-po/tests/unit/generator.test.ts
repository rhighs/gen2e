import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Jimp } from "jimp";
import { Gen2EPOGenerator } from "../../src/generator";
import type { Gen2EPOCodeAPI } from "../../src/types";
import { scriptedModel, textTurn } from "../support/scripted-model";

const noFiles: Gen2EPOCodeAPI = {
  find: async () => [],
  list: async () => [],
  touch: async () => {},
  rm: async () => {},
};

describe("Gen2EPOGenerator", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "gen2e-po-gen-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("reads recorded artifacts from absolute paths and from paths relative to staticDataDir", async () => {
    const png = await new Jimp({ width: 8, height: 8, color: 0xffffffff }).getBuffer("image/png");
    writeFileSync(path.join(dir, "from.jpg"), png);
    writeFileSync(path.join(dir, "from.html"), "<html>from</html>");
    const model = scriptedModel([textTurn("{}")]);
    const generator = new Gen2EPOGenerator({ model, staticDataDir: dir }, noFiles);

    await generator.generate({
      body: "await page.click('#a')",
      context: {
        task: "click a",
        refs: {
          screenshotPath: path.join(dir, "from.jpg"),
          htmlPath: "from.html",
          pageUrl: "https://x",
        },
      },
    });

    expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).toContain("<html>from</html>");
  }, 30_000);
});
