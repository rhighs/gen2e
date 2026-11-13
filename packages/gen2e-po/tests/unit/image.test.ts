import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Jimp } from "jimp";
import { loadImageWithLabel } from "../../src/image";

describe("loadImageWithLabel", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "gen2e-po-image-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns a jpeg of the same size with the label drawn on it", async () => {
    const src = path.join(dir, "page.png");
    const blank = new Jimp({ width: 320, height: 120, color: 0xffffffff });
    writeFileSync(src, await blank.getBuffer("image/png"));

    const out = await Jimp.read(await loadImageWithLabel(src, "Starting page"));

    expect(out.mime).toBe("image/jpeg");
    expect(out.width).toBe(320);
    expect(out.height).toBe(120);
    expect(out.getPixelColor(0, 0)).toBeGreaterThan(0xf0f0f0ff);
    expect(Array.from(out.bitmap.data).some((v) => v < 128)).toBe(true);
  });

  test("rejects when the file does not exist", async () => {
    await expect(loadImageWithLabel(path.join(dir, "missing.png"), "x")).rejects.toThrow("ENOENT");
  });
});
