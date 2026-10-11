// SPDX-License-Identifier: Apache-2.0
// M0-11：像素差异与几何偏差两道比较必须各自可判定，且不引入容差以外的模糊。
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import {
  compareCaptureTrees,
  compareGeometry,
  compareImages,
  GEOMETRY_TOLERANCE,
  PIXEL_RATIO_LIMIT,
} from "./compare.mjs";
import { encodePng } from "./png.mjs";

const run = promisify(execFile);

function image(width, height, fill = [255, 255, 255, 255]) {
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) data.set(fill, index * 4);
  return { width, height, data };
}

function paint(target, x, y, colour) {
  target.data.set(colour, (y * target.width + x) * 4);
}

test("identical images report zero changed pixels", () => {
  const left = image(4, 3);
  const right = image(4, 3);
  const result = compareImages(left, right);
  assert.equal(result.changedPixels, 0);
  assert.equal(result.ratio, 0);
  assert.equal(result.passed, true);
});

test("anti-aliasing noise inside the channel tolerance is not counted", () => {
  const left = image(2, 1, [100, 100, 100, 255]);
  const right = image(2, 1, [110, 105, 100, 255]);
  const result = compareImages(left, right);
  assert.equal(result.changedPixels, 0);
  assert.equal(result.maxDelta, 10);
  assert.equal(result.passed, true);
});

test("a changed block is counted with its bounding box and ratio", () => {
  const left = image(10, 10);
  const right = image(10, 10);
  for (let y = 2; y < 4; y += 1) {
    for (let x = 3; x < 5; x += 1) paint(right, x, y, [0, 0, 0, 255]);
  }
  const result = compareImages(left, right);
  assert.equal(result.changedPixels, 4);
  assert.equal(Number(result.ratio.toFixed(4)), 0.04);
  assert.deepEqual(result.box, { x: 3, y: 2, width: 2, height: 2 });
  assert.equal(result.passed, false);
});

test("pixel ratio boundary is inclusive at the documented limit", () => {
  assert.equal(PIXEL_RATIO_LIMIT, 0.002);
  const left = image(1000, 1);
  const right = image(1000, 1);
  paint(right, 0, 0, [0, 0, 0, 255]);
  paint(right, 1, 0, [0, 0, 0, 255]);
  const atLimit = compareImages(left, right);
  assert.equal(atLimit.ratio, PIXEL_RATIO_LIMIT);
  assert.equal(atLimit.passed, true);
  paint(right, 2, 0, [0, 0, 0, 255]);
  assert.equal(compareImages(left, right).passed, false);
});

test("images with different sizes are rejected instead of silently compared", () => {
  assert.throws(() => compareImages(image(2, 2), image(3, 2)), /size/);
});

test("geometry differences at exactly the 2 pixel tolerance pass", () => {
  assert.equal(GEOMETRY_TOLERANCE, 2);
  const baseline = { composer: { x: 10, y: 20, width: 100, height: 40 } };
  const within = { composer: { x: 12, y: 18, width: 102, height: 38 } };
  assert.equal(compareGeometry(baseline, within).passed, true);
  const beyond = { composer: { x: 13, y: 20, width: 100, height: 40 } };
  const result = compareGeometry(baseline, beyond);
  assert.equal(result.passed, false);
  assert.deepEqual(
    result.moved.map((entry) => entry.testid),
    ["composer"],
  );
  assert.equal(result.moved[0].maxDelta, 3);
});

test("geometry comparison reports missing and extra test ids", () => {
  const baseline = {
    composer: { x: 0, y: 0, width: 10, height: 10 },
    gone: { x: 1, y: 1, width: 2, height: 2 },
  };
  const current = {
    composer: { x: 0, y: 0, width: 10, height: 10 },
    added: { x: 5, y: 5, width: 2, height: 2 },
  };
  const result = compareGeometry(baseline, current);
  assert.deepEqual(result.missing, ["gone"]);
  assert.deepEqual(result.extra, ["added"]);
  assert.equal(result.passed, false);
});

test("geometry comparison ignores sub-pixel jitter and honours a custom tolerance", () => {
  const baseline = { panel: { x: 1, y: 1, width: 10, height: 10 } };
  const jitter = { panel: { x: 1.4, y: 0.6, width: 10.4, height: 9.7 } };
  assert.equal(compareGeometry(baseline, jitter).passed, true);
  assert.equal(compareGeometry(baseline, jitter, 0).passed, false);
});

test("CLI compares two capture trees, writes diffs and fails the run", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-ui-baseline-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const baseline = join(root, "baseline");
  const current = join(root, "current");
  const out = join(root, "report");
  const writeTree = async (directory, colour) => {
    await mkdir(join(directory, "pages", "main"), { recursive: true });
    const capture = image(6, 4, colour);
    paint(capture, 1, 1, [255, 0, 0, 255]);
    await writeFile(join(directory, "pages", "main", "light-1360.png"), encodePng(capture));
    await writeFile(
      join(directory, "pages", "main", "light-1360.geometry.json"),
      `${JSON.stringify({ composer: { x: 10, y: 10, width: 50, height: 20 } }, null, 2)}\n`,
    );
    await writeFile(
      join(directory, "manifest.json"),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          commit: "0".repeat(40),
          pages: [
            {
              id: "main",
              theme: "light",
              width: 1360,
              png: "pages/main/light-1360.png",
              geometry: "pages/main/light-1360.geometry.json",
            },
          ],
        },
        null,
        2,
      )}\n`,
    );
  };
  await writeTree(baseline, [255, 255, 255, 255]);
  await writeTree(current, [255, 255, 255, 255]);
  await writeFile(
    join(current, "pages", "main", "light-1360.geometry.json"),
    `${JSON.stringify({ composer: { x: 10, y: 14, width: 50, height: 20 } }, null, 2)}\n`,
  );

  const failure = await run(
    process.execPath,
    [
      join(import.meta.dirname, "compare.mjs"),
      "--baseline",
      baseline,
      "--current",
      current,
      "--out",
      out,
    ],
    { windowsHide: true },
  ).catch((error) => error);
  assert.equal(failure.code, 1);
  const report = JSON.parse(await readFile(join(out, "report.json"), "utf8"));
  assert.equal(report.summary.pages, 1);
  assert.equal(report.summary.failed, 1);
  assert.equal(report.pages[0].geometry.passed, false);
  assert.equal(report.pages[0].pixels.passed, true);
});

test("compareCaptureTrees skips pages missing from the current tree as failures", async () => {
  const pages = await compareCaptureTrees({
    baseline: {
      manifest: { pages: [{ id: "main", theme: "light", width: 1360 }] },
      read: async () => null,
    },
    current: { manifest: { pages: [] }, read: async () => null },
  });
  assert.equal(pages.summary.failed, 1);
  assert.equal(pages.pages[0].error, "missing capture in current tree");
  void mkdtemp;
});
