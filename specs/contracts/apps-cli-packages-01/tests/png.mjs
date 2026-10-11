// SPDX-License-Identifier: Apache-2.0
// 合同测试用的合成 PNG 生成器（不依赖第三方图片库）。
// 只用于构造确定性的小图片：IHDR + 单块 IDAT(zlib) + IEND。
import { deflateSync } from "node:zlib";

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1)
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

/**
 * 生成 width×height 的 8 位 RGB PNG。
 * `noise: true` 时逐像素取伪随机值（PNG 压缩率差，便于测压缩路径），否则是平滑渐变。
 */
export function pngBytes(width, height, options = {}) {
  const color = options.color ?? [128, 64, 32];
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let state = 0x12345678;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return (state >>> 8) & 0xff;
  };
  for (let row = 0; row < height; row += 1) {
    const offset = row * (width * 3 + 1);
    raw[offset] = 0;
    for (let column = 0; column < width; column += 1) {
      const pixel = offset + 1 + column * 3;
      if (options.noise) {
        raw[pixel] = next();
        raw[pixel + 1] = next();
        raw[pixel + 2] = next();
      } else {
        raw[pixel] = (color[0] + column * 7 + row * 3) % 256;
        raw[pixel + 1] = (color[1] + row * 11) % 256;
        raw[pixel + 2] = (color[2] + column * 5) % 256;
      }
    }
  }
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** 最小 WebP 容器字节（只需通过魔数探测，不会被解码）。 */
export function webpBytes(payloadLength = 64) {
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(payloadLength + 4, 4);
  header.write("WEBP", 8, "ascii");
  const body = Buffer.alloc(payloadLength, 0x41);
  return Buffer.concat([header, body]);
}
