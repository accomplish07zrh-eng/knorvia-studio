#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// 截图基线比较：像素差异与关键元素几何都要看，任何一项超标即退出非零。
// 用法：node scripts/ui-baseline/compare.mjs --baseline <基线目录> --current <新截图目录> [--out <差异目录>]
//       [--box-tolerance-px 2] [--max-structural-diff-ratio 0.02] [--strict] [--allow-environment-mismatch]
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { readCapture, sha256 } from "./lib/baseline.mjs";
import { compareGeometry, DEFAULT_BOX_TOLERANCE_PX } from "./lib/geometry.mjs";
import {
  compareImages,
  DEFAULT_STRUCTURAL_CHANNEL_DELTA,
  isPixelIdentical,
} from "./lib/pixel-diff.mjs";
import { decodePng, encodePng } from "./lib/png.mjs";

/** 结构性像素差异的默认上限：整页像素里超过该比例就判为真实视觉变化。 */
export const DEFAULT_MAX_STRUCTURAL_DIFF_RATIO = 0.02;

const USAGE = `用法：node scripts/ui-baseline/compare.mjs --baseline <目录> --current <目录> [选项]
  --baseline <目录>                基线产物目录（ui-baseline 分支里的目录）
  --current <目录>                 本次截图目录（capture.mjs 的 --out）
  --out <目录>                     差异图输出目录（默认 <current>/diff）
  --box-tolerance-px <n>           data-testid 包围盒允许偏差，默认 ${DEFAULT_BOX_TOLERANCE_PX}
  --max-structural-diff-ratio <r>  结构性像素差异上限，默认 ${DEFAULT_MAX_STRUCTURAL_DIFF_RATIO}
  --structural-channel-delta <n>   单通道差异超过该值才算结构性，默认 ${DEFAULT_STRUCTURAL_CHANNEL_DELTA}
  --strict                         要求像素完全一致（用于验证同一提交的确定性）
  --allow-environment-mismatch     允许基线与本机的渲染环境不同（默认拒绝）
  --json <文件>                    报告 JSON 输出路径（默认 <current>/compare.json）`;

function parseArguments(argv) {
  const options = {
    baseline: null,
    current: null,
    out: null,
    json: null,
    boxTolerancePx: DEFAULT_BOX_TOLERANCE_PX,
    maxStructuralDiffRatio: DEFAULT_MAX_STRUCTURAL_DIFF_RATIO,
    structuralChannelDelta: DEFAULT_STRUCTURAL_CHANNEL_DELTA,
    strict: false,
    allowEnvironmentMismatch: false,
  };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    const value = () => {
      const next = argv[++index];
      if (next === undefined) throw new Error(`${argument} 需要一个取值`);
      return next;
    };
    if (argument === "--baseline") options.baseline = resolve(value());
    else if (argument === "--current") options.current = resolve(value());
    else if (argument === "--out") options.out = resolve(value());
    else if (argument === "--json") options.json = resolve(value());
    else if (argument === "--box-tolerance-px") options.boxTolerancePx = Number(value());
    else if (argument === "--max-structural-diff-ratio") {
      options.maxStructuralDiffRatio = Number(value());
    } else if (argument === "--structural-channel-delta") {
      options.structuralChannelDelta = Number(value());
    } else if (argument === "--strict") options.strict = true;
    else if (argument === "--allow-environment-mismatch") options.allowEnvironmentMismatch = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`未知参数：${argument}`);
  }
  return options;
}

function imageKey(entry) {
  return `${entry.image.page}|${entry.image.theme}|${entry.image.width}`;
}

function environmentMismatches(baseline, current) {
  const mismatches = [];
  for (const key of ["platform", "arch"]) {
    if (baseline?.[key] !== current?.[key]) {
      mismatches.push(`${key}: ${baseline?.[key]} → ${current?.[key]}`);
    }
  }
  if (baseline?.chromium?.version !== current?.chromium?.version) {
    mismatches.push(
      `chromium.version: ${baseline?.chromium?.version} → ${current?.chromium?.version}`,
    );
  }
  if (baseline?.fixedClock !== current?.fixedClock) {
    mismatches.push(`fixedClock: ${baseline?.fixedClock} → ${current?.fixedClock}`);
  }
  if (baseline?.fixedTimezone !== current?.fixedTimezone) {
    mismatches.push(`fixedTimezone: ${baseline?.fixedTimezone} → ${current?.fixedTimezone}`);
  }
  return mismatches;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return;
  }
  if (!options.baseline || !options.current)
    throw new Error(`--baseline 与 --current 都是必填\n\n${USAGE}`);
  const outDirectory = options.out ?? join(options.current, "diff");
  const jsonPath = options.json ?? join(options.current, "compare.json");
  const baseline = await readCapture(options.baseline);
  const current = await readCapture(options.current);

  const mismatches = environmentMismatches(
    baseline.manifest.environment,
    current.manifest.environment,
  );
  if (mismatches.length > 0 && !options.allowEnvironmentMismatch) {
    throw new Error(
      [
        "基线与本机的渲染环境不同，像素比较没有意义：",
        ...mismatches.map((value) => `  - ${value}`),
        "如确认要在不同环境下做几何比较，请加 --allow-environment-mismatch。",
      ].join("\n"),
    );
  }
  const pagesChanged = baseline.manifest.pagesSha256 !== current.manifest.pagesSha256;

  const baselineByKey = new Map(baseline.entries.map((entry) => [imageKey(entry), entry]));
  const currentByKey = new Map(current.entries.map((entry) => [imageKey(entry), entry]));
  await mkdir(outDirectory, { recursive: true });

  const results = [];
  let pixelFailures = 0;
  let geometryFailures = 0;
  let missingBaselines = 0;

  for (const [key, entry] of currentByKey) {
    const baselineEntry = baselineByKey.get(key);
    const { page, theme, width } = entry.image;
    if (!baselineEntry) {
      missingBaselines++;
      results.push({ page, theme, width, status: "baseline-missing" });
      console.error(`[compare] ${key} 缺少基线图`);
      continue;
    }
    const currentImage = decodePng(await readFile(entry.imagePath));
    const baselineImage = decodePng(await readFile(baselineEntry.imagePath));
    const pixel = compareImages(baselineImage, currentImage, {
      structuralChannelDelta: options.structuralChannelDelta,
    });
    const geometry = compareGeometry(
      baselineEntry.meta.geometry,
      entry.meta.geometry,
      options.boxTolerancePx,
    );
    const pixelOk = options.strict
      ? isPixelIdentical(pixel)
      : !pixel.dimensionMismatch && pixel.structuralRatio <= options.maxStructuralDiffRatio;
    if (!pixelOk) pixelFailures++;
    if (!geometry.passed) geometryFailures++;
    let diffFile = null;
    if (!pixelOk && pixel.diff) {
      diffFile = join(outDirectory, `${page}-${theme}-${width}.png`);
      await mkdir(outDirectory, { recursive: true });
      await writeFile(
        diffFile,
        encodePng({ width: pixel.width, height: pixel.height, data: pixel.diff }),
      );
    }
    results.push({
      page,
      theme,
      width,
      height: entry.image.height,
      status: pixelOk && geometry.passed ? "passed" : "failed",
      pixel: {
        ok: pixelOk,
        dimensionMismatch: pixel.dimensionMismatch,
        changedPixels: pixel.changedPixels,
        structuralPixels: pixel.structuralPixels,
        totalPixels: pixel.totalPixels,
        diffRatio: pixel.diffRatio,
        structuralRatio: pixel.structuralRatio,
        maxChannelDelta: pixel.maxChannelDelta,
        baselineSha256: baselineEntry.image.imageSha256,
        currentSha256: entry.image.imageSha256,
      },
      geometry: {
        ok: geometry.passed,
        tolerancePx: geometry.tolerancePx,
        failures: geometry.failures,
      },
      diffFile,
    });
  }

  const baselineOnly = [...baselineByKey.keys()].filter((key) => !currentByKey.has(key));
  const report = {
    schema: 1,
    baseline: options.baseline,
    current: options.current,
    baselineCommit: baseline.manifest.commit,
    currentCommit: current.manifest.commit,
    environment: {
      mismatches,
      pagesManifestChanged: pagesChanged,
      baselinePagesSha256: baseline.manifest.pagesSha256,
      currentPagesSha256: current.manifest.pagesSha256,
    },
    thresholds: {
      boxTolerancePx: options.boxTolerancePx,
      maxStructuralDiffRatio: options.maxStructuralDiffRatio,
      structuralChannelDelta: options.structuralChannelDelta,
      strict: options.strict,
    },
    summary: {
      compared: results.length,
      passed: results.filter((entry) => entry.status === "passed").length,
      pixelFailures,
      geometryFailures,
      baselineMissing: missingBaselines,
      baselineOnly: baselineOnly.length,
    },
    baselineOnly,
    results,
  };
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  for (const entry of results) {
    if (entry.status === "passed") continue;
    const reasons = [];
    if (entry.status === "baseline-missing") reasons.push("基线缺失");
    if (entry.pixel && !entry.pixel.ok) {
      reasons.push(
        `像素：结构差异 ${(entry.pixel.structuralRatio * 100).toFixed(4)}%（${entry.pixel.structuralPixels} px）/ 全部差异 ${(entry.pixel.diffRatio * 100).toFixed(4)}%`,
      );
    }
    if (entry.geometry && !entry.geometry.ok) {
      reasons.push(
        `几何：${entry.geometry.failures
          .map(
            (failure) =>
              `${failure.testId}=${failure.reason}${failure.delta ? `(${JSON.stringify(failure.delta)})` : ""}`,
          )
          .join(", ")}`,
      );
    }
    console.error(
      `[compare] 失败 ${entry.page} ${entry.theme} ${entry.width}：${reasons.join("；")}`,
    );
  }
  const summary = report.summary;
  console.log(
    `[compare] 比较 ${summary.compared} 张：通过 ${summary.passed}，像素超标 ${summary.pixelFailures}，几何超标 ${summary.geometryFailures}，缺基线 ${summary.baselineMissing}，仅基线有 ${summary.baselineOnly}`,
  );
  console.log(`[compare] 报告：${jsonPath}`);
  if (summary.pixelFailures + summary.geometryFailures + summary.baselineMissing > 0) {
    process.exitCode = 1;
  }
  // 供测试与调用方确认产物可复现：报告自身也要有摘要。
  console.log(`[compare] 报告摘要 ${sha256(await readFile(jsonPath))}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
