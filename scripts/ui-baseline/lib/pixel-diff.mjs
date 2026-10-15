// SPDX-License-Identifier: Apache-2.0
// 像素比较：区分「抗锯齿级差异」与「结构性差异」，并输出可视差异图。
// 只用像素相等判定会被字体抗锯齿误报，所以结构性阈值单独统计，几何比较另行负责布局信号。

/** 结构性差异的默认单通道阈值（0-255）：低于等于它的差异按抗锯齿噪声计。 */
export const DEFAULT_STRUCTURAL_CHANNEL_DELTA = 8;

const UNCHANGED = [255, 255, 255, 255];
const ANTIALIAS = [255, 165, 0, 255];
const STRUCTURAL = [255, 0, 0, 255];

function writePixel(target, offset, rgba) {
  target[offset] = rgba[0];
  target[offset + 1] = rgba[1];
  target[offset + 2] = rgba[2];
  target[offset + 3] = rgba[3];
}

/**
 * 逐像素比较两张同尺寸 RGBA 图。
 * 返回统计量、差异图（未变=白、仅抗锯齿级=橙、结构性=红）与尺寸不一致标记。
 */
export function compareImages(
  previous,
  current,
  { structuralChannelDelta = DEFAULT_STRUCTURAL_CHANNEL_DELTA } = {},
) {
  if (previous.width !== current.width || previous.height !== current.height) {
    return {
      dimensionMismatch: true,
      previousSize: { width: previous.width, height: previous.height },
      currentSize: { width: current.width, height: current.height },
      width: previous.width,
      height: previous.height,
      totalPixels: 0,
      changedPixels: 0,
      structuralPixels: 0,
      maxChannelDelta: 255,
      diffRatio: 1,
      structuralRatio: 1,
      diff: null,
    };
  }
  const { width, height } = previous;
  const totalPixels = width * height;
  const diff = new Uint8Array(totalPixels * 4);
  let changedPixels = 0;
  let structuralPixels = 0;
  let maxChannelDelta = 0;
  for (let index = 0; index < totalPixels; index++) {
    const offset = index * 4;
    const deltaRed = Math.abs(previous.data[offset] - current.data[offset]);
    const deltaGreen = Math.abs(previous.data[offset + 1] - current.data[offset + 1]);
    const deltaBlue = Math.abs(previous.data[offset + 2] - current.data[offset + 2]);
    const deltaAlpha = Math.abs(previous.data[offset + 3] - current.data[offset + 3]);
    const delta = Math.max(deltaRed, deltaGreen, deltaBlue, deltaAlpha);
    if (delta > maxChannelDelta) maxChannelDelta = delta;
    if (delta === 0) {
      writePixel(diff, offset, UNCHANGED);
      continue;
    }
    changedPixels++;
    if (delta > structuralChannelDelta) {
      structuralPixels++;
      writePixel(diff, offset, STRUCTURAL);
    } else {
      writePixel(diff, offset, ANTIALIAS);
    }
  }
  return {
    dimensionMismatch: false,
    width,
    height,
    totalPixels,
    changedPixels,
    structuralPixels,
    maxChannelDelta,
    diffRatio: totalPixels === 0 ? 0 : changedPixels / totalPixels,
    structuralRatio: totalPixels === 0 ? 0 : structuralPixels / totalPixels,
    diff,
  };
}

/** 只关心「是否完全一致」的场景（例如同一提交连续两次截图）用这个判定。 */
export function isPixelIdentical(comparison) {
  return !comparison.dimensionMismatch && comparison.changedPixels === 0;
}
