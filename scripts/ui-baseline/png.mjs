// SPDX-License-Identifier: Apache-2.0
// M0-11：截图基线需要的 PNG 读写用 node:zlib 自实现，避免为工具再引入第三方图像库。
import { deflateSync, inflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

export function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBytes = Buffer.from(type, "latin1");
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, checksum]);
}

function paeth(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDelta = Math.abs(estimate - left);
  const aboveDelta = Math.abs(estimate - above);
  const upperLeftDelta = Math.abs(estimate - upperLeft);
  if (leftDelta <= aboveDelta && leftDelta <= upperLeftDelta) return left;
  return aboveDelta <= upperLeftDelta ? above : upperLeft;
}

const CHANNELS_BY_COLOUR_TYPE = new Map([
  [0, 1],
  [2, 3],
  [4, 2],
  [6, 4],
]);

export function decodePng(bytes) {
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error("Invalid PNG signature");
  }
  let offset = 8;
  let header = null;
  const data = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("latin1", offset + 4, offset + 8);
    const bodyStart = offset + 8;
    const bodyEnd = bodyStart + length;
    if (bodyEnd + 4 > bytes.length) throw new Error(`Truncated PNG chunk: ${type}`);
    if (crc32(bytes.subarray(offset + 4, bodyEnd)) !== bytes.readUInt32BE(bodyEnd)) {
      throw new Error(`PNG chunk CRC mismatch: ${type}`);
    }
    const body = bytes.subarray(bodyStart, bodyEnd);
    if (type === "IHDR") header = body;
    else if (type === "IDAT") data.push(body);
    else if (type === "IEND") break;
    offset = bodyEnd + 4;
  }
  if (!header) throw new Error("PNG is missing an IHDR chunk");
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const bitDepth = header[8];
  const colourType = header[9];
  const compression = header[10];
  const filterMethod = header[11];
  const interlace = header[12];
  if (bitDepth !== 8) throw new Error(`Unsupported PNG bit depth: ${bitDepth}`);
  if (!CHANNELS_BY_COLOUR_TYPE.has(colourType))
    throw new Error(`Unsupported PNG colour type: ${colourType}`);
  if (compression !== 0 || filterMethod !== 0)
    throw new Error("Unsupported PNG compression or filter method");
  if (interlace !== 0) throw new Error("Unsupported PNG interlace method");
  if (!data.length) throw new Error("PNG is missing IDAT data");
  if (!width || !height) throw new Error("PNG has an empty frame");

  const channels = CHANNELS_BY_COLOUR_TYPE.get(colourType);
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(data));
  if (raw.length < height * (stride + 1)) {
    throw new Error(
      `Truncated PNG scanline data: expected ${height * (stride + 1)} bytes, found ${raw.length}`,
    );
  }
  const pixels = new Uint8Array(width * height * 4);
  const previous = new Uint8Array(stride);
  const current = new Uint8Array(stride);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    const filter = raw[rowStart];
    for (let index = 0; index < stride; index += 1) {
      const value = raw[rowStart + 1 + index];
      const left = index >= channels ? current[index - channels] : 0;
      const above = previous[index];
      const upperLeft = index >= channels ? previous[index - channels] : 0;
      let predictor;
      switch (filter) {
        case 0:
          predictor = 0;
          break;
        case 1:
          predictor = left;
          break;
        case 2:
          predictor = above;
          break;
        case 3:
          predictor = Math.floor((left + above) / 2);
          break;
        case 4:
          predictor = paeth(left, above, upperLeft);
          break;
        default:
          throw new Error(`Unsupported PNG scanline filter: ${filter}`);
      }
      current[index] = (value + predictor) & 0xff;
    }
    for (let x = 0; x < width; x += 1) {
      const source = x * channels;
      const target = (y * width + x) * 4;
      if (channels === 1 || channels === 2) {
        pixels[target] = current[source];
        pixels[target + 1] = current[source];
        pixels[target + 2] = current[source];
        pixels[target + 3] = channels === 2 ? current[source + 1] : 255;
      } else {
        pixels[target] = current[source];
        pixels[target + 1] = current[source + 1];
        pixels[target + 2] = current[source + 2];
        pixels[target + 3] = channels === 4 ? current[source + 3] : 255;
      }
    }
    previous.set(current);
  }
  return { width, height, data: pixels };
}

export function encodePng({ width, height, data }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0)
    throw new Error("encodePng needs positive integer dimensions");
  if (data.length !== width * height * 4)
    throw new Error(`encodePng expects RGBA pixels: ${data.length} bytes for ${width}x${height}`);
  const stride = width * 4;
  // 统一使用 filter 0：工具只用来写差异图和测试夹具，字节稳定比压缩率重要。
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    Buffer.from(data.buffer, data.byteOffset + y * stride, stride).copy(raw, rowStart + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    SIGNATURE,
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
