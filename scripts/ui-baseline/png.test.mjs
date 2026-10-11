// SPDX-License-Identifier: Apache-2.0
// M0-11：PNG 编解码是截图基线的最小依赖面，用 node:zlib 自实现，避免再引入第三方图像库。
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { test } from "node:test";
import { crc32, decodePng, encodePng, pngChunk } from "./png.mjs";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pngFromRaw({
  width,
  height,
  colorType,
  bitDepth = 8,
  rows,
  interlace = 0,
  extraChunks = [],
}) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = bitDepth;
  header[9] = colorType;
  header[10] = 0;
  header[11] = 0;
  header[12] = interlace;
  return Buffer.concat([
    SIGNATURE,
    pngChunk("IHDR", header),
    ...extraChunks,
    pngChunk("IDAT", deflateSync(Buffer.concat(rows))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function paeth(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDelta = Math.abs(estimate - left);
  const aboveDelta = Math.abs(estimate - above);
  const upperLeftDelta = Math.abs(estimate - upperLeft);
  if (leftDelta <= aboveDelta && leftDelta <= upperLeftDelta) return left;
  return aboveDelta <= upperLeftDelta ? above : upperLeft;
}

// 按 PNG 规范的逆向算式构造每一行的过滤字节，覆盖全部五种过滤器。
function filteredRows(pixels, width, height, filterOf) {
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const raw = pixels.subarray(y * stride, (y + 1) * stride);
    const previous =
      y === 0 ? new Uint8Array(stride) : pixels.subarray((y - 1) * stride, y * stride);
    const filter = filterOf(y);
    const line = Buffer.alloc(stride + 1);
    line[0] = filter;
    for (let index = 0; index < stride; index += 1) {
      const left = index >= bytesPerPixel ? raw[index - bytesPerPixel] : 0;
      const above = previous[index];
      const upperLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] : 0;
      const predictor =
        filter === 0
          ? 0
          : filter === 1
            ? left
            : filter === 2
              ? above
              : filter === 3
                ? Math.floor((left + above) / 2)
                : paeth(left, above, upperLeft);
      line[index + 1] = (raw[index] - predictor) & 0xff;
    }
    rows.push(line);
  }
  return rows;
}

test("encodePng then decodePng round-trips RGBA pixels", () => {
  const width = 3;
  const height = 2;
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < data.length; index += 1) data[index] = (index * 37) % 256;
  const decoded = decodePng(encodePng({ width, height, data }));
  assert.equal(decoded.width, width);
  assert.equal(decoded.height, height);
  assert.deepEqual([...decoded.data], [...data]);
});

test("decodePng expands greyscale and RGB scanlines into RGBA", () => {
  const grey = pngFromRaw({
    width: 2,
    height: 1,
    colorType: 0,
    rows: [Buffer.from([0, 10, 200])],
  });
  assert.deepEqual([...decodePng(grey).data], [10, 10, 10, 255, 200, 200, 200, 255]);
  const rgb = pngFromRaw({
    width: 1,
    height: 2,
    colorType: 2,
    rows: [Buffer.from([0, 1, 2, 3]), Buffer.from([0, 4, 5, 6])],
  });
  assert.deepEqual([...decodePng(rgb).data], [1, 2, 3, 255, 4, 5, 6, 255]);
});

test("decodePng reverses every scanline filter", () => {
  const width = 2;
  const height = 5;
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      pixels[offset] = (x * 40 + y * 17) % 256;
      pixels[offset + 1] = (255 - y * 30) % 256;
      pixels[offset + 2] = (x * 90 + y * 5) % 256;
      pixels[offset + 3] = 255;
    }
  }
  // 五种过滤器各占一行，任一逆向实现写错都会在对应行暴露。
  const rows = filteredRows(pixels, width, height, (y) => y);
  const png = pngFromRaw({ width, height, colorType: 6, rows });
  assert.deepEqual([...decodePng(png).data], [...pixels]);
});

test("decodePng ignores ancillary chunks and keeps pixels intact", () => {
  const png = pngFromRaw({
    width: 1,
    height: 1,
    colorType: 6,
    rows: [Buffer.from([0, 9, 8, 7, 255])],
    extraChunks: [pngChunk("tEXt", Buffer.from("Comment\0fixture"))],
  });
  assert.deepEqual([...decodePng(png).data], [9, 8, 7, 255]);
});

test("decodePng rejects unsupported or malformed input", () => {
  assert.throws(() => decodePng(Buffer.from("not a png")), /signature/);
  const palette = pngFromRaw({ width: 1, height: 1, colorType: 3, rows: [Buffer.from([0, 0])] });
  assert.throws(() => decodePng(palette), /colour type/);
  const interlace = pngFromRaw({
    width: 1,
    height: 1,
    colorType: 2,
    interlace: 1,
    rows: [Buffer.from([0, 1, 2, 3])],
  });
  assert.throws(() => decodePng(interlace), /interlac/);
  const bitDepth = pngFromRaw({
    width: 1,
    height: 1,
    colorType: 0,
    bitDepth: 4,
    rows: [Buffer.from([0, 0])],
  });
  assert.throws(() => decodePng(bitDepth), /bit depth/);
});

test("decodePng rejects a scanline short by one filter byte", () => {
  const png = pngFromRaw({
    width: 2,
    height: 2,
    colorType: 6,
    rows: [Buffer.from([0, 1, 2, 3, 4])],
  });
  assert.throws(() => decodePng(png), /scanline/);
});

test("decodePng verifies chunk CRCs", () => {
  const bytes = encodePng({ width: 1, height: 1, data: new Uint8Array([1, 2, 3, 4]) });
  const corrupted = Buffer.from(bytes);
  corrupted[corrupted.length - 6] ^= 0xff;
  assert.throws(() => decodePng(corrupted), /CRC/);
});

test("crc32 matches published PNG check values", () => {
  assert.equal(crc32(Buffer.from("IEND")), 0xae426082);
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
  assert.equal(crc32(Buffer.alloc(0)), 0);
});

test("encodePng is byte-stable for identical pixels", () => {
  const data = new Uint8Array(16);
  for (let index = 0; index < data.length; index += 1) data[index] = index;
  assert.deepEqual(
    encodePng({ width: 2, height: 2, data }),
    encodePng({ width: 2, height: 2, data }),
  );
});
