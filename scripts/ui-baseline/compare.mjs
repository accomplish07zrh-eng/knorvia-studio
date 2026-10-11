// SPDX-License-Identifier: Apache-2.0
// M0-11：截图基线的两道比较——像素差异与关键元素几何偏差。
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { decodePng, encodePng } from "./png.mjs";

// 只按像素逐点相等判分会把字体抗锯齿当成回归；通道容差用于吸收这类噪声。
export const CHANNEL_TOLERANCE = 12;
// 允许的差异像素占比。确定性检查要求 0；替换回归默认 0.2%。
export const PIXEL_RATIO_LIMIT = 0.002;
// 计划书规定：关键元素几何偏差不超过 2 像素。
export const GEOMETRY_TOLERANCE = 2;

const round = (value) => Math.round(value * 100) / 100;

export function compareImages(left, right, options = {}) {
  if (left.width !== right.width || left.height !== right.height) {
    throw new Error(
      `Image size mismatch: ${left.width}x${left.height} vs ${right.width}x${right.height}`,
    );
  }
  if (left.data.length !== right.data.length) throw new Error("Image data length mismatch");
  const channelTolerance = options.channelTolerance ?? CHANNEL_TOLERANCE;
  const maxPixelRatio = options.maxPixelRatio ?? PIXEL_RATIO_LIMIT;
  const total = left.width * left.height;
  let changedPixels = 0;
  let maxDelta = 0;
  let totalDelta = 0;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = -1;
  let maxY = -1;
  for (let index = 0; index < left.data.length; index += 4) {
    let delta = 0;
    for (let channel = 0; channel < 4; channel += 1) {
      const difference = Math.abs(left.data[index + channel] - right.data[index + channel]);
      if (difference > delta) delta = difference;
    }
    totalDelta += delta;
    if (delta > maxDelta) maxDelta = delta;
    if (delta > channelTolerance) {
      changedPixels += 1;
      const pixel = index / 4;
      const x = pixel % left.width;
      const y = Math.floor(pixel / left.width);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const ratio = total ? changedPixels / total : 0;
  return {
    width: left.width,
    height: left.height,
    changedPixels,
    ratio,
    maxDelta,
    meanDelta: total ? totalDelta / total : 0,
    box:
      changedPixels > 0
        ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
        : null,
    channelTolerance,
    maxPixelRatio,
    passed: ratio <= maxPixelRatio,
  };
}

export function diffImage(left, right, options = {}) {
  const channelTolerance = options.channelTolerance ?? CHANNEL_TOLERANCE;
  const data = new Uint8Array(left.data);
  for (let index = 0; index < left.data.length; index += 4) {
    let delta = 0;
    for (let channel = 0; channel < 4; channel += 1) {
      const difference = Math.abs(left.data[index + channel] - right.data[index + channel]);
      if (difference > delta) delta = difference;
    }
    if (delta > channelTolerance) {
      data[index] = 255;
      data[index + 1] = 0;
      data[index + 2] = 0;
      data[index + 3] = 255;
    }
  }
  return encodePng({ width: left.width, height: left.height, data });
}

function normalizeBox(box) {
  if (typeof box !== "object" || box === null) throw new Error("Geometry entry must be an object");
  for (const key of ["x", "y", "width", "height"]) {
    if (typeof box[key] !== "number" || !Number.isFinite(box[key])) {
      throw new Error(`Geometry entry is missing a finite ${key}`);
    }
  }
  return box;
}

export function compareGeometry(baseline, current, tolerance = GEOMETRY_TOLERANCE) {
  const missing = [];
  const moved = [];
  for (const [testid, box] of Object.entries(baseline)) {
    normalizeBox(box);
    const now = current[testid];
    if (!now) {
      missing.push(testid);
      continue;
    }
    normalizeBox(now);
    const delta = {
      x: round(now.x - box.x),
      y: round(now.y - box.y),
      width: round(now.width - box.width),
      height: round(now.height - box.height),
    };
    const maxDelta = Math.max(
      Math.abs(delta.x),
      Math.abs(delta.y),
      Math.abs(delta.width),
      Math.abs(delta.height),
    );
    if (maxDelta > tolerance) moved.push({ testid, delta, maxDelta, baseline: box, current: now });
  }
  const extra = Object.keys(current).filter((testid) => !(testid in baseline));
  missing.sort();
  extra.sort();
  moved.sort(
    (left, right) => right.maxDelta - left.maxDelta || left.testid.localeCompare(right.testid),
  );
  return {
    tolerance,
    missing,
    extra,
    moved,
    passed: missing.length === 0 && extra.length === 0 && moved.length === 0,
  };
}

export function keyOf(entry) {
  return `${entry.id}/${entry.theme}-${entry.width}`;
}

export async function compareCaptureTrees({ baseline, current, outDirectory, options = {} }) {
  const pages = [];
  for (const entry of baseline.manifest.pages ?? []) {
    const wanted = (current.manifest.pages ?? []).find(
      (candidate) =>
        candidate.id === entry.id &&
        candidate.theme === entry.theme &&
        candidate.width === entry.width,
    );
    if (!wanted) {
      pages.push({
        id: entry.id,
        theme: entry.theme,
        width: entry.width,
        passed: false,
        error: "missing capture in current tree",
      });
      continue;
    }
    const baselinePng = await baseline.read(entry.png);
    const currentPng = await current.read(wanted.png);
    if (!baselinePng || !currentPng) {
      pages.push({
        id: entry.id,
        theme: entry.theme,
        width: entry.width,
        passed: false,
        error: "missing capture image bytes",
      });
      continue;
    }
    const baselineImage = decodePng(baselinePng);
    const currentImage = decodePng(currentPng);
    const pixels = compareImages(baselineImage, currentImage, options);
    const baselineGeometry = JSON.parse((await baseline.read(entry.geometry))?.toString() ?? "{}");
    const currentGeometry = JSON.parse((await current.read(wanted.geometry))?.toString() ?? "{}");
    const geometry = compareGeometry(
      baselineGeometry,
      currentGeometry,
      options.geometryTolerance ?? GEOMETRY_TOLERANCE,
    );
    let diffPath = null;
    if (outDirectory && !pixels.passed) {
      diffPath = join("diffs", entry.id, `${entry.theme}-${entry.width}.diff.png`);
      const absolute = resolve(outDirectory, ...diffPath.split("/"));
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, diffImage(baselineImage, currentImage, options));
    }
    pages.push({
      id: entry.id,
      theme: entry.theme,
      width: entry.width,
      pixels,
      geometry,
      diff: diffPath,
      passed: pixels.passed && geometry.passed,
    });
  }
  const failed = pages.filter((page) => !page.passed).length;
  return {
    schemaVersion: 1,
    baseline: baseline.manifest.commit ?? null,
    current: current.manifest.commit ?? null,
    limits: {
      channelTolerance: options.channelTolerance ?? CHANNEL_TOLERANCE,
      maxPixelRatio: options.maxPixelRatio ?? PIXEL_RATIO_LIMIT,
      geometryTolerance: options.geometryTolerance ?? GEOMETRY_TOLERANCE,
    },
    summary: { pages: pages.length, passed: pages.length - failed, failed },
    pages,
  };
}

export async function readCaptureTree(root) {
  const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
  return {
    root,
    manifest,
    read: async (relative) => {
      try {
        return await readFile(resolve(root, ...relative.split("/")));
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    },
  };
}

const HELP = [
  "UI baseline compare: node scripts/ui-baseline/compare.mjs --baseline <dir> --current <dir> [options]",
  "  --baseline <dir>      capture tree to compare against (usually from the ui-baseline branch)",
  "  --current <dir>       capture tree produced by capture.mjs",
  "  --out <dir>           write report.json and diff images to this directory",
  "  --tolerance <px>      geometry tolerance (default: 2)",
  "  --max-pixel-ratio <r> allowed changed pixel ratio (default: 0.002; determinism checks use 0)",
  "Exit code 0 only when every page passes both comparisons.",
].join("\n");

export async function runCli(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      baseline: { type: "string" },
      current: { type: "string" },
      out: { type: "string" },
      tolerance: { type: "string" },
      "max-pixel-ratio": { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help || !values.baseline || !values.current) {
    console.log(HELP);
    return values.help ? 0 : 2;
  }
  const report = await compareCaptureTrees({
    baseline: await readCaptureTree(resolve(values.baseline)),
    current: await readCaptureTree(resolve(values.current)),
    outDirectory: values.out ? resolve(values.out) : null,
    options: {
      geometryTolerance:
        values.tolerance === undefined ? GEOMETRY_TOLERANCE : Number(values.tolerance),
      maxPixelRatio:
        values["max-pixel-ratio"] === undefined
          ? PIXEL_RATIO_LIMIT
          : Number(values["max-pixel-ratio"]),
    },
  });
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (values.out) {
    const directory = resolve(values.out);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "report.json"), serialized);
  }
  process.stdout.write(serialized);
  return report.summary.failed === 0 ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  runCli()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(`ui baseline compare failed: ${error.message}`);
      process.exitCode = 1;
    });
}
