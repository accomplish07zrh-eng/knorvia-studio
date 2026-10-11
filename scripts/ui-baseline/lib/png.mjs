// SPDX-License-Identifier: Apache-2.0
// 截图基线工具的 PNG 编解码：只依赖 node:zlib，避免为像素比较引入新的第三方依赖。
// 支持 Chromium 截图实际会产出的子集：8 位、非隔行、颜色类型 0/2/3/4/6。
import { deflateSync, inflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS_BY_COLOR_TYPE = new Map([
  [0, 1],
  [2, 3],
  [3, 1],
  [4, 2],
  [6, 4],
]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function paethPredictor(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const distanceLeft = Math.abs(estimate - left);
  const distanceUp = Math.abs(estimate - up);
  const distanceUpLeft = Math.abs(estimate - upLeft);
  if (distanceLeft <= distanceUp && distanceLeft <= distanceUpLeft) return left;
  if (distanceUp <= distanceUpLeft) return up;
  return upLeft;
}

/** 逐行反滤波。`previous` 与 `target` 都是长度为 width * bytesPerPixel 的行缓冲。 */
function unfilterRow(filter, line, previous, target, bytesPerPixel) {
  for (let index = 0; index < target.length; index++) {
    const left = index >= bytesPerPixel ? target[index - bytesPerPixel] : 0;
    const up = previous[index];
    const upLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] : 0;
    const value = line[index];
    let restored;
    switch (filter) {
      case 0:
        restored = value;
        break;
      case 1:
        restored = value + left;
        break;
      case 2:
        restored = value + up;
        break;
      case 3:
        restored = value + ((left + up) >> 1);
        break;
      case 4:
        restored = value + paethPredictor(left, up, upLeft);
        break;
      default:
        throw new Error(`不支持的 PNG 行滤波类型：${filter}`);
    }
    target[index] = restored & 0xff;
  }
}

function readChunks(buffer) {
  const chunks = [];
  let offset = SIGNATURE.length;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("latin1", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) throw new Error(`PNG 数据块 ${type} 被截断`);
    chunks.push({ type, data: buffer.subarray(dataStart, dataEnd) });
    offset = dataEnd + 4;
    if (type === "IEND") break;
  }
  return chunks;
}

/**
 * 解码 PNG 为 RGBA 像素。
 * 返回 `{ width, height, data }`，`data` 是长度 width * height * 4 的 Uint8Array。
 */
export function decodePng(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (buffer.length < SIGNATURE.length || !buffer.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error("PNG 签名不正确");
  }
  const chunks = readChunks(buffer);
  const headerChunk = chunks.find((chunk) => chunk.type === "IHDR");
  if (!headerChunk) throw new Error("PNG 缺少 IHDR");
  const header = headerChunk.data;
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const bitDepth = header[8];
  const colorType = header[9];
  const compression = header[10];
  const interlace = header[12];
  if (width <= 0 || height <= 0) throw new Error(`PNG 尺寸无效：${width}x${height}`);
  if (bitDepth !== 8) throw new Error(`只支持 8 位 PNG，实际为 ${bitDepth} 位`);
  if (compression !== 0) throw new Error(`不支持的 PNG 压缩方式：${compression}`);
  if (interlace !== 0) throw new Error("不支持隔行 PNG");
  const channels = CHANNELS_BY_COLOR_TYPE.get(colorType);
  if (!channels) throw new Error(`不支持的 PNG 颜色类型：${colorType}`);
  const paletteChunk = chunks.find((chunk) => chunk.type === "PLTE");
  const palette = colorType === 3 ? paletteChunk?.data : undefined;
  if (colorType === 3 && !palette) throw new Error("调色板 PNG 缺少 PLTE");
  const transparency = chunks.find((chunk) => chunk.type === "tRNS")?.data;
  const compressed = Buffer.concat(
    chunks.filter((chunk) => chunk.type === "IDAT").map((chunk) => chunk.data),
  );
  if (compressed.length === 0) throw new Error("PNG 缺少 IDAT");
  const raw = inflateSync(compressed);

  const stride = width * channels;
  const expected = (stride + 1) * height;
  if (raw.length < expected) {
    throw new Error(`PNG 像素数据不足：期望 ${expected} 字节，实际 ${raw.length} 字节`);
  }
  const data = new Uint8Array(width * height * 4);
  let previous = Buffer.alloc(stride);
  let row = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const start = y * (stride + 1);
    const filter = raw[start];
    const line = raw.subarray(start + 1, start + 1 + stride);
    // 复用两块缓冲：previous 是上一行，row 承接当前行；解码后交换，避免逐行分配。
    unfilterRow(filter, line, previous, row, channels);
    const decoded = row;
    row = previous;
    previous = decoded;
    for (let x = 0; x < width; x++) {
      const source = x * channels;
      const target = (y * width + x) * 4;
      switch (colorType) {
        case 0:
          data[target] = previous[source];
          data[target + 1] = previous[source];
          data[target + 2] = previous[source];
          data[target + 3] = 255;
          break;
        case 2:
          data[target] = previous[source];
          data[target + 1] = previous[source + 1];
          data[target + 2] = previous[source + 2];
          data[target + 3] = 255;
          break;
        case 3: {
          const paletteIndex = previous[source];
          data[target] = palette[paletteIndex * 3];
          data[target + 1] = palette[paletteIndex * 3 + 1];
          data[target + 2] = palette[paletteIndex * 3 + 2];
          data[target + 3] =
            transparency && paletteIndex < transparency.length ? transparency[paletteIndex] : 255;
          break;
        }
        case 4:
          data[target] = previous[source];
          data[target + 1] = previous[source];
          data[target + 2] = previous[source];
          data[target + 3] = previous[source + 1];
          break;
        default:
          data[target] = previous[source];
          data[target + 1] = previous[source + 1];
          data[target + 2] = previous[source + 2];
          data[target + 3] = previous[source + 3];
          break;
      }
    }
  }
  return { width, height, data, colorType };
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function filterRow(filter, line, previous, bytesPerPixel) {
  const output = Buffer.alloc(line.length);
  for (let index = 0; index < line.length; index++) {
    const left = index >= bytesPerPixel ? line[index - bytesPerPixel] : 0;
    const up = previous[index];
    const upLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] : 0;
    let prediction = 0;
    switch (filter) {
      case 1:
        prediction = left;
        break;
      case 2:
        prediction = up;
        break;
      case 3:
        prediction = (left + up) >> 1;
        break;
      case 4:
        prediction = paethPredictor(left, up, upLeft);
        break;
      default:
        prediction = 0;
        break;
    }
    output[index] = (line[index] - prediction) & 0xff;
  }
  return output;
}

/**
 * 把 RGBA 像素编码为 PNG。`filter` 允许指定 0-4 固定的行滤波，
 * 默认 0（None）：截图和差异图都不依赖压缩率，确定性与可复现优先。
 */
export function encodePng({ width, height, data }, options = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`PNG 尺寸无效：${width}x${height}`);
  }
  const expected = width * height * 4;
  if (data.length !== expected) {
    throw new Error(`RGBA 数据长度必须是 ${expected}，实际 ${data.length}`);
  }
  const filter = options.filter ?? 0;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const line = Buffer.from(data.buffer, data.byteOffset + y * stride, stride);
    raw[y * (stride + 1)] = filter;
    filterRow(filter, line, previous, 4).copy(raw, y * (stride + 1) + 1);
    previous = line;
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
