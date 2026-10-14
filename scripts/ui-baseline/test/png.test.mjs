// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { decodePng, encodePng } from "../lib/png.mjs";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

function syntheticImage(width, height, seed = 7) {
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < data.length; index++) {
    data[index] = (index * 31 + seed * 17) % 256;
  }
  return { width, height, data };
}

test("PNG 编解码在各种行滤波下往返一致", () => {
  const image = syntheticImage(37, 23);
  for (const filter of [0, 1, 2, 3, 4]) {
    const encoded = encodePng(image, { filter });
    const decoded = decodePng(encoded);
    assert.equal(decoded.width, image.width);
    assert.equal(decoded.height, image.height);
    assert.deepEqual(Buffer.from(decoded.data), Buffer.from(image.data), `filter=${filter}`);
  }
});

test("编码结果本身是确定性的", () => {
  const image = syntheticImage(16, 9, 3);
  assert.deepEqual(encodePng(image), encodePng(image));
});

test("1x1 边界尺寸可以往返", () => {
  const image = { width: 1, height: 1, data: Uint8Array.from([1, 2, 3, 4]) };
  assert.deepEqual(Buffer.from(decodePng(encodePng(image)).data), Buffer.from(image.data));
});

test("解码 Chromium 截图产出的 8 位 RGB PNG", async () => {
  // 真实浏览器截图的样本：颜色类型 2、无 alpha，解码后 alpha 必须补齐为 255。
  const buffer = await readFile(join(fixtures, "chromium-rgb.png"));
  const decoded = decodePng(buffer);
  assert.equal(decoded.width, 6);
  assert.equal(decoded.height, 4);
  assert.equal(decoded.colorType, 2);
  assert.equal(decoded.data.length, 6 * 4 * 4);
  // 左上角是 2px 宽的蓝色块，第 3 个像素是白底。
  assert.deepEqual(Array.from(decoded.data.slice(0, 4)), [0, 136, 255, 255]);
  assert.deepEqual(Array.from(decoded.data.slice(8, 12)), [255, 255, 255, 255]);
  for (let index = 3; index < decoded.data.length; index += 4) {
    assert.equal(decoded.data[index], 255, `第 ${index} 字节的 alpha 必须是 255`);
  }
});

test("解码带 alpha 的 RGBA PNG", async () => {
  const buffer = await readFile(join(fixtures, "rgba-with-alpha.png"));
  const decoded = decodePng(buffer);
  assert.equal(decoded.width, 2);
  assert.equal(decoded.height, 2);
  assert.equal(decoded.colorType, 6);
  assert.deepEqual(Array.from(decoded.data.slice(0, 4)), [255, 0, 0, 128]);
  assert.deepEqual(Array.from(decoded.data.slice(8, 12)), [0, 0, 255, 0]);
});

test("非法输入给出明确错误", () => {
  assert.throws(() => decodePng(Buffer.from("not a png at all")), /签名/);
  const image = syntheticImage(4, 4);
  const encoded = encodePng(image);
  const truncated = encoded.subarray(0, encoded.length - 20);
  assert.throws(() => decodePng(truncated), /截断|不足|IEND/);
  assert.throws(() => encodePng({ width: 2, height: 2, data: new Uint8Array(3) }), /RGBA 数据长度/);
  assert.throws(() => encodePng({ width: 0, height: 2, data: new Uint8Array(0) }), /尺寸无效/);
});
