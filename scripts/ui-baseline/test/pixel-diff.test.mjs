// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  compareImages,
  DEFAULT_STRUCTURAL_CHANNEL_DELTA,
  isPixelIdentical,
} from "../lib/pixel-diff.mjs";

function image(width, height, fill = 255) {
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = fill;
    data[index + 1] = fill;
    data[index + 2] = fill;
    data[index + 3] = 255;
  }
  return { width, height, data };
}

test("完全一致时零差异", () => {
  const left = image(8, 4);
  const right = image(8, 4);
  const result = compareImages(left, right);
  assert.equal(result.changedPixels, 0);
  assert.equal(result.structuralPixels, 0);
  assert.equal(result.diffRatio, 0);
  assert.equal(result.maxChannelDelta, 0);
  assert.equal(isPixelIdentical(result), true);
});

test("抗锯齿级差异计入 changed 但不计结构性差异", () => {
  const left = image(4, 1, 100);
  const right = image(4, 1, 100);
  right.data[0] = 100 + DEFAULT_STRUCTURAL_CHANNEL_DELTA; // 恰好等于阈值：不算结构性
  right.data[4] = 100 + DEFAULT_STRUCTURAL_CHANNEL_DELTA + 1; // 超过阈值：算结构性
  const result = compareImages(left, right);
  assert.equal(result.changedPixels, 2);
  assert.equal(result.structuralPixels, 1);
  assert.equal(result.maxChannelDelta, DEFAULT_STRUCTURAL_CHANNEL_DELTA + 1);
  assert.equal(result.structuralRatio, 1 / 4);
  assert.equal(isPixelIdentical(result), false);
});

test("差异图按类型着色：未变白、抗锯齿橙、结构性红", () => {
  const left = image(3, 1, 0);
  const right = image(3, 1, 0);
  right.data[4] = 3;
  right.data[8] = 90;
  const result = compareImages(left, right);
  assert.deepEqual(Array.from(result.diff.slice(0, 4)), [255, 255, 255, 255]);
  assert.deepEqual(Array.from(result.diff.slice(4, 8)), [255, 165, 0, 255]);
  assert.deepEqual(Array.from(result.diff.slice(8, 12)), [255, 0, 0, 255]);
});

test("尺寸不同直接判为不一致", () => {
  const result = compareImages(image(4, 4), image(4, 5));
  assert.equal(result.dimensionMismatch, true);
  assert.equal(result.diff, null);
  assert.equal(isPixelIdentical(result), false);
  assert.deepEqual(result.previousSize, { width: 4, height: 4 });
  assert.deepEqual(result.currentSize, { width: 4, height: 5 });
});

test("颜色变化即使很小也会被记录为全部差异", () => {
  const left = image(2, 2, 255);
  const right = image(2, 2, 250);
  const result = compareImages(left, right);
  assert.equal(result.changedPixels, 4);
  assert.equal(result.structuralPixels, 0);
  assert.equal(result.diffRatio, 1);
});
